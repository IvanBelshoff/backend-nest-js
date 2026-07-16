import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import type { Response } from 'express';
import { pipeUIMessageStreamToResponse, toUIMessageStream } from 'ai';
import { env } from 'src/shared/env.schema';
import type { Usuario } from 'src/database/entities/Usuarios';
import { AiService } from './ai.service';
import { AiAccessService } from './ai-access.service';
import { AiAdminToolsService } from './ai-admin-tools.service';
import { AiChatPersistenceService } from './ai-chat-persistence.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { AiThreadTitleService } from './ai-thread-title.service';
import { extractTextFromUIMessage } from './ai-thread-title.util';

@Injectable()
export class AiChatService {
  constructor(
    private readonly aiService: AiService,
    private readonly aiAccessService: AiAccessService,
    private readonly aiChatPersistenceService: AiChatPersistenceService,
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly aiAdminToolsService: AiAdminToolsService,
    private readonly aiThreadTitleService: AiThreadTitleService,
  ) {}

  async streamChat(params: {
    user: Usuario;
    messages: UIMessage[];
    threadId?: string;
    res: Response;
  }): Promise<{ threadId: string }> {
    const userId = Number(params.user.id);
    const thread = await this.aiChatPersistenceService.resolveThread(
      userId,
      params.threadId,
    );

    const lastMessage = params.messages.at(-1);
    let truncatedTitle: string | null = null;

    if (lastMessage?.role === 'user') {
      await this.aiChatPersistenceService.saveUserMessage(thread.id, lastMessage);
      truncatedTitle = await this.aiChatPersistenceService.maybeSetTruncatedTitle(
        thread.id,
        lastMessage,
      );
    }

    const firstUserMessage = params.messages.find((message) => message.role === 'user');
    const firstUserText = firstUserMessage
      ? extractTextFromUIMessage(firstUserMessage)
      : '';

    const isAdmin = await this.aiAccessService.isAdmin(userId);
    const reportCatalog =
      await this.aiReportToolsService.getReportCatalogForPrompt(userId);

    const tools = {
      ...this.buildReportTools(userId),
      ...(isAdmin ? this.buildAdminTools(userId) : {}),
    };

    const responseHeaders: Record<string, string> = {
      'X-Thread-Id': thread.id,
    };

    if (truncatedTitle) {
      responseHeaders['X-Thread-Title'] = truncatedTitle;
    }

    const result = streamText({
      model: this.aiService.getChatModel(),
      system: this.aiChatPersistenceService.buildSystemPrompt(
        params.user,
        reportCatalog,
        { isAdmin },
      ),
      messages: await convertToModelMessages(params.messages),
      tools,
      stopWhen: stepCountIs(env.AI_MAX_STEPS),
      onFinish: async ({ text }) => {
        const shouldRefineTitle =
          await this.aiChatPersistenceService.canRefineTitle(thread.id);

        if (!text?.trim()) {
          if (shouldRefineTitle && firstUserText) {
            void this.refineThreadTitle(thread.id, firstUserText);
          }
          return;
        }

        await this.aiChatPersistenceService.saveAssistantMessage(thread.id, {
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text }],
        });

        if (shouldRefineTitle && firstUserText) {
          void this.refineThreadTitle(thread.id, firstUserText);
        }
      },
    });

    pipeUIMessageStreamToResponse({
      response: params.res,
      stream: toUIMessageStream({ stream: result.stream }),
      headers: responseHeaders,
    });

    return { threadId: thread.id };
  }

  private refineThreadTitle(threadId: string, userMessageText: string): void {
    void this.aiThreadTitleService
      .generateTitle(userMessageText)
      .then((refined) =>
        this.aiChatPersistenceService.maybeRefineTitle(
          threadId,
          userMessageText,
          refined,
        ),
      )
      .catch(() => undefined);
  }

  private buildReportTools(userId: number) {
    return {
      listarRelatoriosDisponiveis: tool({
        description:
          'Lista relatórios autorizados. Retorna relatorios (somente nomes para o usuário) e referenciaInterna (id/estado para chamadas de ferramenta — não verbalizar ao usuário).',
        inputSchema: z.object({}),
        execute: async () => this.aiReportToolsService.listAvailableReports(userId),
      }),
      descreverRelatorio: tool({
        description:
          'Retorna metadados de um relatório (nome, colunas, parâmetros, estado). Informe estado online/offline ao usuário somente se ele perguntar explicitamente.',
        inputSchema: z.object({
          relatorioId: z.number().int().positive(),
        }),
        execute: async ({ relatorioId }) =>
          this.aiReportToolsService.describeReport(userId, relatorioId),
      }),
      consultarRelatorio: tool({
        description:
          'Consulta dados de um relatório autorizado. Online = query no banco; offline = snapshot. Retorna linhas e total com fonte citável.',
        inputSchema: z.object({
          relatorioId: z.number().int().positive(),
          parametros: z.record(z.string(), z.unknown()).optional(),
        }),
        execute: async ({ relatorioId, parametros }) =>
          this.aiReportToolsService.queryReport(
            userId,
            relatorioId,
            parametros ?? {},
          ),
      }),
    };
  }

  private buildAdminTools(userId: number) {
    return {
      listarUsuariosSistema: tool({
        description:
          'Lista usuários do sistema (admin). Use filter com primeiro nome, sobrenome, nome completo (ex: "Lucas Barcellos") ou e-mail. Não retorna preferências de UI.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          filter: z.string().optional(),
        }),
        execute: async (params) => this.aiAdminToolsService.listUsers(userId, params),
      }),
      obterUsuarioSistema: tool({
        description:
          'Obtém acesso efetivo de um usuário por ID (admin). Retorna regras RBAC, permissões, relatoriosPrivadosComAcesso, dashboardsPrivadosComAcesso (concessão explícita), relatoriosPublicosAcessiveis e dashboardsPublicosAcessiveis. Não inclui itens disponíveis sem concessão.',
        inputSchema: z.object({
          usuarioId: z.number().int().positive(),
        }),
        execute: async ({ usuarioId }) =>
          this.aiAdminToolsService.getUser(userId, usuarioId),
      }),
      listarRelatoriosSistema: tool({
        description:
          'Lista todos os relatórios cadastrados no sistema (admin). Não inclui query SQL.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) => this.aiAdminToolsService.listReports(userId, params),
      }),
      listarDashboardsSistema: tool({
        description:
          'Lista todos os dashboards cadastrados no sistema (admin). Não inclui URLs.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.listDashboards(userId, params),
      }),
      obterMetricasSistema: tool({
        description:
          'Obtém snapshot atual de métricas do sistema: processo, HTTP, dependências e storage (admin).',
        inputSchema: z.object({}),
        execute: async () => this.aiAdminToolsService.getMetrics(userId),
      }),
      obterHistoricoMetricas: tool({
        description: 'Obtém histórico de métricas do sistema (admin).',
        inputSchema: z.object({
          hours: z.number().int().positive().max(168).optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.getMetricsHistory(userId, params),
      }),
      listarJobsSistema: tool({
        description:
          'Lista jobs de exportação e snapshot de relatórios (admin).',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          page_size: z.number().int().positive().max(100).optional(),
          status: z.string().optional(),
          tipo: z.string().optional(),
          relatorio_id: z.number().int().positive().optional(),
          user_id: z.number().int().positive().optional(),
        }),
        execute: async (params) => this.aiAdminToolsService.listJobs(userId, params),
      }),
      listarExecucoesAgendamento: tool({
        description: 'Lista execuções de agendamentos do sistema (admin).',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          page_size: z.number().int().positive().max(100).optional(),
          status: z.string().optional(),
          relatorio_id: z.number().int().positive().optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.listScheduleExecutions(userId, params),
      }),
    };
  }
}
