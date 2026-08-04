import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AiChatMessage } from 'src/database/entities/AiChatMessage';
import { AiAnalysisService } from '../ai-analysis.service';
import { AiChatPersistenceService } from '../ai-chat-persistence.service';
import {
  aiPlanSchema,
  buildPlanExecutionPrompt,
  type AiPlan,
  type AiPlanProposal,
  type UpdateAiPlanDto,
} from './ai-plan.schema';

@Injectable()
export class AiPlanService {
  constructor(
    @InjectRepository(AiChatMessage)
    private readonly messageRepository: Repository<AiChatMessage>,
    private readonly aiChatPersistenceService: AiChatPersistenceService,
    @Inject(forwardRef(() => AiAnalysisService))
    private readonly aiAnalysisService: AiAnalysisService,
  ) {}

  createPlanFromProposal(proposal: AiPlanProposal): AiPlan {
    const planId = randomUUID();
    const usedQuestionIds = new Set<string>();
    const usedStepIds = new Set<string>();

    const perguntas = proposal.perguntas.map((pergunta, index) => {
      let id = pergunta.id?.trim() || `q${index + 1}`;
      if (usedQuestionIds.has(id)) {
        id = `q${index + 1}-${randomUUID().slice(0, 8)}`;
      }
      usedQuestionIds.add(id);
      return { ...pergunta, id };
    });

    const passos = proposal.passos.map((passo, index) => {
      let id = passo.id?.trim() || `s${index + 1}`;
      if (usedStepIds.has(id)) {
        id = `s${index + 1}-${randomUUID().slice(0, 8)}`;
      }
      usedStepIds.add(id);
      return {
        ...passo,
        id,
        status: passo.status ?? 'pending',
      };
    });

    return aiPlanSchema.parse({
      ...proposal,
      id: planId,
      status: 'awaiting_approval',
      perguntas,
      passos,
    });
  }

  /**
   * Persiste o plano assim que a tool roda — não depende do onFinish do stream,
   * que pode não gravar a mensagem do assistente a tempo (ou nunca).
   */
  async persistProposedPlanMessage(
    threadId: string,
    plan: AiPlan,
  ): Promise<AiChatMessage> {
    const existing = await this.messageRepository.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });

    for (const message of existing) {
      const current = this.parsePlan(message.metadata);
      if (current?.id === plan.id) {
        await this.persistPlan(message, plan);
        return message;
      }
    }

    return this.aiChatPersistenceService.saveAssistantMessage(
      threadId,
      {
        id: randomUUID(),
        role: 'assistant',
        parts: [
          { type: 'data-plan', id: plan.id, data: plan },
          {
            type: 'text',
            text: 'Preparei um plano de análise. Responda as perguntas no card abaixo, ajuste os passos se quiser e aprove para eu executar.',
          },
        ],
      },
      { plan: { ...plan } },
    );
  }

  async hasPersistedPlan(threadId: string, planId: string): Promise<boolean> {
    try {
      await this.findPlanMessageInternal(threadId, planId);
      return true;
    } catch {
      return false;
    }
  }

  private async findPlanMessageInternal(
    threadId: string,
    planId: string,
  ): Promise<{ message: AiChatMessage; plan: AiPlan }> {
    const messages = await this.messageRepository.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });

    for (const message of messages) {
      const fromMeta = this.parsePlan(message.metadata);
      if (fromMeta?.id === planId) {
        return { message, plan: fromMeta };
      }

      for (const part of message.parts ?? []) {
        if ((part as { type?: string }).type !== 'data-plan') {
          continue;
        }
        const parsed = aiPlanSchema.safeParse((part as { data?: unknown }).data);
        if (parsed.success && parsed.data.id === planId) {
          return { message, plan: parsed.data };
        }
      }
    }

    throw new NotFoundException('Plano não encontrado neste thread.');
  }

  async findPlanMessage(
    userId: number,
    threadId: string,
    planId: string,
  ): Promise<{ message: AiChatMessage; plan: AiPlan }> {
    await this.aiChatPersistenceService.assertThreadOwnershipPublic(
      userId,
      threadId,
    );

    return this.findPlanMessageInternal(threadId, planId);
  }

  async updatePlan(
    userId: number,
    threadId: string,
    planId: string,
    dto: UpdateAiPlanDto,
  ): Promise<AiPlan> {
    const { message, plan } = await this.findPlanMessage(
      userId,
      threadId,
      planId,
    );

    if (plan.status !== 'awaiting_approval') {
      throw new BadRequestException(
        'Só é possível editar planos aguardando aprovação.',
      );
    }

    const perguntas = plan.perguntas.map((pergunta) => {
      const patch = dto.perguntas?.find((item) => item.id === pergunta.id);
      if (!patch) {
        return pergunta;
      }

      return {
        ...pergunta,
        ...(patch.respostaUsuario !== undefined
          ? { respostaUsuario: patch.respostaUsuario }
          : {}),
        ...(patch.respostaLivre !== undefined
          ? { respostaLivre: patch.respostaLivre }
          : {}),
      };
    });

    const passos = plan.passos.map((passo) => {
      const patch = dto.passos?.find((item) => item.id === passo.id);
      if (!patch) {
        return passo;
      }

      return {
        ...passo,
        ...(patch.titulo ? { titulo: patch.titulo } : {}),
        ...(patch.detalhe ? { detalhe: patch.detalhe } : {}),
      };
    });

    const updated: AiPlan = {
      ...plan,
      objetivo: dto.objetivo?.trim() || plan.objetivo,
      perguntas,
      passos,
    };

    await this.persistPlan(message, updated);
    return updated;
  }

  async approvePlan(
    userId: number,
    threadId: string,
    planId: string,
  ): Promise<AiPlan> {
    const { message, plan } = await this.findPlanMessage(
      userId,
      threadId,
      planId,
    );

    if (plan.status !== 'awaiting_approval') {
      throw new BadRequestException(
        'Este plano não está aguardando aprovação.',
      );
    }

    this.assertPlanReadyForApproval(plan);

    const pergunta = buildPlanExecutionPrompt(plan);
    const enqueueResult = await this.aiAnalysisService.enqueue({
      userId,
      threadId,
      pergunta,
      relatorioIds: plan.relatorioIds,
      contexto: `Plano aprovado id=${plan.id}`,
      planId: plan.id,
      planSnapshot: plan,
    });

    if ('erro' in enqueueResult) {
      // Fila indisponível: marca failed e devolve erro para o cliente.
      const failed: AiPlan = {
        ...plan,
        status: 'failed',
        erro: enqueueResult.erro,
      };
      await this.persistPlan(message, failed);
      throw new BadRequestException(enqueueResult.erro);
    }

    const running: AiPlan = {
      ...plan,
      status: 'running',
      jobId: enqueueResult.jobId,
    };

    await this.persistPlan(message, running, {
      analysis: {
        status: 'processing',
        jobId: enqueueResult.jobId,
        pergunta,
      },
    });

    return running;
  }

  async cancelPlan(
    userId: number,
    threadId: string,
    planId: string,
  ): Promise<AiPlan> {
    const { message, plan } = await this.findPlanMessage(
      userId,
      threadId,
      planId,
    );

    if (plan.status !== 'awaiting_approval') {
      throw new BadRequestException(
        'Só é possível cancelar planos aguardando aprovação.',
      );
    }

    const cancelled: AiPlan = { ...plan, status: 'cancelled' };
    await this.persistPlan(message, cancelled);
    return cancelled;
  }

  async markPlanOutcome(
    threadId: string,
    planId: string | undefined,
    status: 'done' | 'failed',
    erro?: string,
  ): Promise<void> {
    if (!planId) {
      return;
    }

    const messages = await this.messageRepository.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });

    for (const message of messages) {
      const plan = this.parsePlan(message.metadata);
      if (plan?.id !== planId) {
        continue;
      }

      await this.persistPlan(message, {
        ...plan,
        status,
        ...(erro ? { erro } : {}),
      });
      return;
    }
  }

  private assertPlanReadyForApproval(plan: AiPlan): void {
    for (const pergunta of plan.perguntas) {
      const answered =
        Boolean(pergunta.respostaUsuario?.trim()) ||
        Boolean(pergunta.respostaLivre?.trim());
      if (!answered) {
        throw new BadRequestException(
          `Responda a pergunta "${pergunta.texto}" antes de aprovar.`,
        );
      }

      if (
        (pergunta.respostaUsuario === 'outra' ||
          pergunta.opcoes.some(
            (o) =>
              o.key === pergunta.respostaUsuario &&
              /outra/i.test(o.label),
          )) &&
        !pergunta.respostaLivre?.trim()
      ) {
        throw new BadRequestException(
          `Descreva a opção "Outra" na pergunta "${pergunta.texto}".`,
        );
      }
    }
  }

  private parsePlan(metadata: Record<string, unknown> | null): AiPlan | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const raw = (metadata as { plan?: unknown }).plan;
    if (!raw) {
      return null;
    }

    const parsed = aiPlanSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private async persistPlan(
    message: AiChatMessage,
    plan: AiPlan,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    const planWithMessage = { ...plan, messageId: message.id };
    const nextMetadata = {
      ...(message.metadata ?? {}),
      ...extraMetadata,
      plan: planWithMessage,
    };

    const nextParts = (message.parts ?? []).map((part) => {
      if ((part as { type?: string }).type !== 'data-plan') {
        return part;
      }

      const data = (part as { data?: unknown }).data;
      const currentId =
        data && typeof data === 'object' && 'id' in data
          ? String((data as { id: unknown }).id)
          : null;

      if (currentId !== plan.id) {
        return part;
      }

      return {
        ...part,
        data: planWithMessage,
      };
    });

    message.metadata = nextMetadata;
    message.parts = nextParts as AiChatMessage['parts'];
    await this.messageRepository.save(message);
  }
}
