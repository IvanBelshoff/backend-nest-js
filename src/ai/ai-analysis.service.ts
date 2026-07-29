import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateText, stepCountIs } from 'ai';
import { Repository } from 'typeorm';
import { Usuario } from 'src/database/entities/Usuarios';
import { PgBossService } from 'src/queue/pg-boss.service';
import { AI_ANALYSIS_QUEUE } from 'src/queue/queue.constants';
import type { AiAnalysisJobPayload } from 'src/queue/types/ai-analysis-job.payload';
import { env } from 'src/shared/env.schema';
import { UserNotificationService } from 'src/user-notifications/user-notification.service';
import { AiAccessService } from './ai-access.service';
import { AiAnalyticsToolsService } from './ai-analytics-tools.service';
import type { AiChartSpec } from './ai-chart-spec.schema';
import { AiChatPersistenceService } from './ai-chat-persistence.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { AiService } from './ai.service';
import {
  buildAnalyticsToolSet,
  buildReportToolSet,
} from './ai-tool-definitions';

/** Estado de uma análise em fila, gravado em `AiChatMessage.metadata.analysis`. */
export type AiAnalysisStatus = 'processing' | 'done' | 'failed';

export type AiAnalysisMetadata = {
  analysis: {
    status: AiAnalysisStatus;
    jobId: string;
    pergunta: string;
  };
};

export type EnqueueAnalysisResult =
  | { status: 'enfileirada'; jobId: string; aviso: string }
  | { erro: string };

const QUEUE_DISABLED_MESSAGE =
  'A fila de análises está indisponível. Rode a análise diretamente com as ferramentas analíticas nesta mesma resposta.';

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
    private readonly pgBossService: PgBossService,
    private readonly aiService: AiService,
    private readonly aiAccessService: AiAccessService,
    private readonly aiChatPersistenceService: AiChatPersistenceService,
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly aiAnalyticsToolsService: AiAnalyticsToolsService,
    private readonly userNotificationService: UserNotificationService,
  ) {}

  get isQueueEnabled(): boolean {
    return this.pgBossService.isEnabled;
  }

  /**
   * Enfileira uma análise pesada. Erros de acesso viram texto de retorno (e não
   * exceção) porque quem chama é uma tool: o modelo precisa poder explicar o
   * motivo ao usuário em vez de derrubar o stream.
   */
  async enqueue(params: {
    userId: number;
    threadId: string;
    pergunta: string;
    relatorioIds: number[];
    contexto?: string;
  }): Promise<EnqueueAnalysisResult> {
    if (!this.isQueueEnabled) {
      return { erro: QUEUE_DISABLED_MESSAGE };
    }

    const relatorioIds = [...new Set(params.relatorioIds)];

    try {
      for (const relatorioId of relatorioIds) {
        await this.aiReportToolsService.assertAiKnowledgeAccess(
          params.userId,
          relatorioId,
        );
      }
    } catch (error) {
      return {
        erro:
          error instanceof Error
            ? error.message
            : 'Sem acesso a um dos relatórios solicitados.',
      };
    }

    const payload: AiAnalysisJobPayload = {
      userId: params.userId,
      threadId: params.threadId,
      pergunta: params.pergunta,
      relatorioIds,
      contexto: params.contexto,
    };

    try {
      const jobId = await this.pgBossService.send(AI_ANALYSIS_QUEUE, payload);

      return {
        status: 'enfileirada',
        jobId,
        aviso:
          'A análise roda em segundo plano. Avise que o usuário pode sair da conversa e será notificado quando o resultado aparecer aqui.',
      };
    } catch (error) {
      this.logger.error(
        `Falha ao enfileirar análise do thread ${params.threadId}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );

      return { erro: QUEUE_DISABLED_MESSAGE };
    }
  }

  /** Metadados que marcam a mensagem do assistente como "análise em andamento". */
  buildProcessingMetadata(jobId: string, pergunta: string): AiAnalysisMetadata {
    return { analysis: { status: 'processing', jobId, pergunta } };
  }

  /**
   * Executa a análise fora da conexão HTTP: roda o pipeline de tools analíticas
   * com `generateText`, grava o resultado como mensagem do assistente (texto +
   * gráficos) e notifica o usuário com deep-link ao thread.
   */
  async runQueuedAnalysis(
    jobId: string,
    payload: AiAnalysisJobPayload,
  ): Promise<void> {
    const alreadyDone = await this.aiChatPersistenceService.hasAnalysisOutcome(
      payload.threadId,
      jobId,
      'done',
    );

    if (alreadyDone) {
      this.logger.warn(`Análise ${jobId} já concluída; job ignorado.`);
      return;
    }

    try {
      const { text, charts } = await this.generateAnalysis(payload);

      await this.aiChatPersistenceService.saveAssistantMessage(
        payload.threadId,
        {
          id: randomUUID(),
          role: 'assistant',
          parts: [
            ...charts.map(({ id, spec }) => ({
              type: 'data-chart' as const,
              id,
              data: spec,
            })),
            { type: 'text' as const, text },
          ],
        },
        { analysis: { status: 'done', jobId, pergunta: payload.pergunta } },
      );

      await this.userNotificationService.createFromAiAnalysis({
        userId: payload.userId,
        threadId: payload.threadId,
        jobId,
        pergunta: payload.pergunta,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.error(`Falha na análise em fila ${jobId}: ${reason}`);

      await this.saveFailure(jobId, payload, reason);
      throw error;
    }
  }

  private async generateAnalysis(payload: AiAnalysisJobPayload): Promise<{
    text: string;
    charts: Array<{ id: string; spec: AiChartSpec }>;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new Error('Usuário da análise não encontrado.');
    }

    // O acesso é revalidado na execução: o job pode rodar minutos depois de ser
    // enfileirado e a concessão de conhecimento IA pode ter sido revogada.
    await this.aiAccessService.assertCanUseAi(payload.userId);
    for (const relatorioId of payload.relatorioIds) {
      await this.aiReportToolsService.assertAiKnowledgeAccess(
        payload.userId,
        relatorioId,
      );
    }

    const charts: Array<{ id: string; spec: AiChartSpec }> = [];
    const emitChart = (spec: AiChartSpec) => {
      charts.push({ id: randomUUID(), spec });
    };

    const reportCatalog =
      await this.aiReportToolsService.getReportCatalogForPrompt(payload.userId);
    const isAdmin = await this.aiAccessService.isAdmin(payload.userId);
    const systemPrompt = this.aiChatPersistenceService.buildSystemPrompt(
      user,
      reportCatalog,
      { isAdmin, mode: 'analitico' },
    );

    const reasoningEnabled = this.aiService.supportsReasoning();
    const result = await generateText({
      model: this.aiService.getChatModel({ thinking: reasoningEnabled }),
      system: `${systemPrompt}\n\n${this.buildQueuedAnalysisInstructions()}`,
      prompt: this.buildAnalysisPrompt(payload),
      tools: {
        ...buildReportToolSet({
          reportTools: this.aiReportToolsService,
          userId: payload.userId,
        }),
        ...buildAnalyticsToolSet({
          analyticsTools: this.aiAnalyticsToolsService,
          userId: payload.userId,
          emitChart,
        }),
      },
      providerOptions: reasoningEnabled
        ? this.aiService.getReasoningProviderOptions()
        : undefined,
      stopWhen: stepCountIs(env.AI_ANALYSIS_MAX_STEPS),
    });

    const text = result.text.trim();

    if (!text && charts.length === 0) {
      throw new Error('A análise não produziu resultado.');
    }

    return {
      text: text || 'A análise gerou os gráficos abaixo.',
      charts,
    };
  }

  private buildQueuedAnalysisInstructions(): string {
    return [
      'Esta é uma análise em segundo plano: não há usuário aguardando no chat.',
      'Não cumprimente, não faça perguntas de esclarecimento e não prometa análises futuras — entregue o resultado final agora.',
      'Se faltar dado para responder, diga exatamente o que faltou e qual seria o próximo passo.',
    ].join('\n');
  }

  private buildAnalysisPrompt(payload: AiAnalysisJobPayload): string {
    const lines = [
      `Pergunta analítica: ${payload.pergunta}`,
      `Relatórios autorizados para esta análise (referência interna): ${payload.relatorioIds.join(', ')}`,
    ];

    if (payload.contexto?.trim()) {
      lines.push(`Contexto da conversa: ${payload.contexto.trim()}`);
    }

    return lines.join('\n');
  }

  private async saveFailure(
    jobId: string,
    payload: AiAnalysisJobPayload,
    reason: string,
  ): Promise<void> {
    try {
      const alreadyRecorded =
        await this.aiChatPersistenceService.hasAnalysisOutcome(
          payload.threadId,
          jobId,
          'failed',
        );

      if (alreadyRecorded) {
        return;
      }

      await this.aiChatPersistenceService.saveAssistantMessage(
        payload.threadId,
        {
          id: randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'text' as const,
              text: 'Não consegui concluir a análise em segundo plano. Você pode tentar de novo ou reformular a pergunta com um recorte menor.',
            },
          ],
        },
        { analysis: { status: 'failed', jobId, pergunta: payload.pergunta } },
      );

      await this.userNotificationService.createFromAiAnalysis({
        userId: payload.userId,
        threadId: payload.threadId,
        jobId,
        pergunta: payload.pergunta,
        errorMessage: reason,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar erro da análise ${jobId}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }
}
