import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  convertToModelMessages,
  createUIMessageStream,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai';
import { z } from 'zod';
import type { Response } from 'express';
import { pipeUIMessageStreamToResponse, toUIMessageStream } from 'ai';
import { env } from 'src/shared/env.schema';
import type { Usuario } from 'src/database/entities/Usuarios';
import { AiService } from './ai.service';
import { AiAccessService } from './ai-access.service';
import { AiAdminToolsService } from './ai-admin-tools.service';
import type { AiChartSpec } from './ai-chart-spec.schema';
import { AiChatPersistenceService } from './ai-chat-persistence.service';
import { AiMentionService } from './ai-mention.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { AiThreadTitleService } from './ai-thread-title.service';
import {
  buildPlanningReportToolSet,
  buildPlanProposalTool,
  buildReportToolSet,
  buildUserDomainAnalyticsToolSet,
} from './ai-tool-definitions';
import { AiPlanService } from './plan/ai-plan.service';
import type { AiPlan } from './plan/ai-plan.schema';
import { extractTextFromUIMessage } from './ai-thread-title.util';
import type { AiChatMode, AiMentionDto } from './dto/ai-chat.dto';
import { runWithNvidiaChatTemplateContext } from './providers/nvidia-chat-template.util';

/** Extrai nome/args de tool-call vazada em XML (formato comum no Ollama). */
function tryParseLeakedFunctionXml(
  text: string,
): { name: string; args: Record<string, string> } | null {
  const trimmed = text.trim();
  if (!/<\/?function=/i.test(trimmed)) {
    return null;
  }

  const nameMatch = trimmed.match(/<function=([^>\s]+)>/i);
  if (!nameMatch?.[1]) {
    return null;
  }

  const args: Record<string, string> = {};
  const paramRegex = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/gi;
  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(trimmed)) !== null) {
    args[match[1]] = match[2].trim();
  }

  return { name: nameMatch[1].trim(), args };
}

/** Detecta tool-call vazado como texto (comum em modelos Ollama / Nemotron). */
function looksLikeLeakedToolCallJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/<\/?tool_call>|<\/?function=/i.test(trimmed)) {
    return true;
  }

  const tryParse = (raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const isToolShape = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    const nameOrType =
      typeof record.name === 'string'
        ? record.name
        : typeof record.type === 'string'
          ? record.type
          : null;
    return nameOrType != null && 'arguments' in record;
  };

  const parsed = tryParse(trimmed);
  if (isToolShape(parsed)) {
    return true;
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isToolShape)) {
    return true;
  }

  return false;
}

function stripToolCallMarkup(text: string): string {
  return text
    .replace(/<\/?tool_call>/gi, '')
    .replace(/<\/?function=[^>\s]+>/gi, '')
    .trim();
}

function sanitizeAssistantText(text: string): string {
  const stripped = stripToolCallMarkup(text);
  if (!stripped) {
    return '';
  }
  if (looksLikeLeakedToolCallJson(text)) {
    return 'Não consegui formatar a resposta. Tente perguntar de novo ou use Nova conversa.';
  }
  return redactInternalLeakageInText(redactToolNamesInText(stripped));
}

const KNOWN_TOOL_NAMES = [
  'listarRelatoriosDisponiveis',
  'descreverRelatorio',
  'consultarRelatorio',
  'listarUsuariosSistema',
  'relacionarAcessosUsuarios',
  'obterUsuarioSistema',
  'listarRelatoriosSistema',
  'listarDashboardsSistema',
  'obterDashboardSistema',
  'obterMetricasSistema',
  'obterHistoricoMetricas',
  'listarJobsSistema',
  'listarExecucoesAgendamento',
  'analisarTendencia',
  'calcularCorrelacao',
  'detectarOutliers',
  'resumirDistribuicao',
  'compararPeriodos',
  'agendarAnaliseProfunda',
] as const;

const KNOWN_TOOL_NAME_PATTERN = new RegExp(
  `\\b(${KNOWN_TOOL_NAMES.join('|')})\\b`,
  'g',
);

function redactToolNamesInText(text: string): string {
  // Importante: NÃO usar trim()/collapse de whitespace aqui.
  // No stream, cada delta é um pedaço (às vezes só " "); trim apaga espaços entre palavras.
  return text
    .replace(KNOWN_TOOL_NAME_PATTERN, 'consulta autorizada')
    .replace(/`consulta autorizada`/g, 'consulta autorizada');
}

/** Remove vazamentos de parâmetros/campos internos (ex.: bloqueado=false) da resposta ao usuário. */
function redactInternalLeakageInText(text: string, options?: { collapseWhitespace?: boolean }): string {
  let next = text
    .replace(/\s*\([^)]*bloqueado\s*=\s*(true|false)[^)]*\)/gi, '')
    .replace(/`bloqueado\s*=\s*(true|false)`/gi, '')
    .replace(/\bbloqueado\s*=\s*(true|false)\b/gi, '');

  if (options?.collapseWhitespace !== false) {
    next = next
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +\./g, '.');
  }

  return next;
}

function asksCapabilityQuestion(text: string): boolean {
  return /o\s*que\s+(voc[eê]|vc)\s+pode|o\s*que\s+consegue|suas?\s+capacidades|o\s*que\s+sabe\s+fazer|como\s+pode\s+ajudar|oque\s+voc[eê]\s+pode/i.test(
    text,
  );
}

function createSanitizedUiMessageStream<T extends Record<string, unknown>>(
  stream: ReadableStream<T>,
  onLeakedText: (text: string) => Promise<string>,
): ReadableStream<T> {
  const textBuffers = new Map<string, string>();
  const heldStarts = new Map<string, T[]>();
  const suppressedIds = new Set<string>();

  return stream.pipeThrough(
    new TransformStream<T, T>({
      async transform(chunk, controller) {
        if (!chunk || typeof chunk !== 'object') {
          controller.enqueue(chunk);
          return;
        }

        const record = chunk as Record<string, unknown>;
        const messageId =
          typeof record.id === 'string' ? record.id : undefined;
        const chunkType =
          typeof record.type === 'string' ? record.type : undefined;

        if (messageId && suppressedIds.has(messageId)) {
          if (chunkType === 'text-end') {
            controller.enqueue(chunk);
          }
          return;
        }

        // Reasoning passa direto (só com redação de nomes técnicos): o buffer de
        // texto abaixo só faz sentido para a resposta final, e retê-lo aqui
        // impediria a UI de mostrar o raciocínio em tempo real.
        if (chunkType?.startsWith('reasoning')) {
          controller.enqueue(
            typeof record.delta === 'string'
              ? ({
                  ...chunk,
                  delta: redactToolNamesInText(record.delta),
                } as T)
              : chunk,
          );
          return;
        }

        if (chunkType === 'text-start' && messageId) {
          const held = heldStarts.get(messageId) ?? [];
          held.push(chunk);
          heldStarts.set(messageId, held);
          return;
        }

        if (typeof record.delta === 'string' && messageId) {
          const accumulated =
            (textBuffers.get(messageId) ?? '') + record.delta;
          textBuffers.set(messageId, accumulated);

          if (looksLikeLeakedToolCallJson(accumulated)) {
            suppressedIds.add(messageId);
            textBuffers.delete(messageId);
            const starts = heldStarts.get(messageId) ?? [];
            heldStarts.delete(messageId);

            const strippedOnly = stripToolCallMarkup(accumulated);
            if (!strippedOnly) {
              for (const start of starts) {
                controller.enqueue(start);
              }
              return;
            }

            let safeText: string;
            try {
              safeText = await onLeakedText(accumulated);
            } catch {
              safeText = sanitizeAssistantText(accumulated);
            }
            if (!safeText.trim()) {
              safeText = sanitizeAssistantText(accumulated);
            }

            for (const start of starts) {
              controller.enqueue(start);
            }
            controller.enqueue({
              ...chunk,
              delta: safeText,
            } as T);
          }
          return;
        }

        if (chunkType === 'text-end' && messageId) {
          const accumulated = textBuffers.get(messageId) ?? '';
          textBuffers.delete(messageId);
          const starts = heldStarts.get(messageId) ?? [];
          heldStarts.delete(messageId);

          const strippedMarkup = stripToolCallMarkup(accumulated);
          const isLeaked = looksLikeLeakedToolCallJson(accumulated);

          if (!strippedMarkup || isLeaked) {
            for (const start of starts) {
              controller.enqueue(start);
            }
            controller.enqueue(chunk);
            return;
          }

          let safeText = sanitizeAssistantText(
            redactInternalLeakageInText(redactToolNamesInText(accumulated), {
              collapseWhitespace: true,
            }),
          );

          for (const start of starts) {
            controller.enqueue(start);
          }
          if (safeText) {
            controller.enqueue({
              type: 'text-delta',
              id: messageId,
              delta: safeText,
            } as unknown as T);
          }
          controller.enqueue(chunk);
          return;
        }

        if (typeof record.text === 'string') {
          let safeText = sanitizeAssistantText(record.text);
          if (looksLikeLeakedToolCallJson(record.text)) {
            try {
              const recovered = await onLeakedText(record.text);
              if (recovered.trim()) {
                safeText = recovered;
              }
            } catch {
              // mantém mensagem sanitizada
            }
          }
          controller.enqueue({
            ...chunk,
            text: safeText,
          } as T);
          return;
        }

        if (typeof record.delta === 'string') {
          const cleaned = stripToolCallMarkup(
            redactInternalLeakageInText(redactToolNamesInText(record.delta), {
              collapseWhitespace: false,
            }),
          );
          if (!cleaned) {
            return;
          }
          controller.enqueue({
            ...chunk,
            delta: cleaned,
          } as T);
          return;
        }

        controller.enqueue(chunk);
      },
    }),
  );
}

@Injectable()
export class AiChatService {
  constructor(
    private readonly aiService: AiService,
    private readonly aiAccessService: AiAccessService,
    private readonly aiChatPersistenceService: AiChatPersistenceService,
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly aiAdminToolsService: AiAdminToolsService,
    private readonly aiPlanService: AiPlanService,
    private readonly aiThreadTitleService: AiThreadTitleService,
    private readonly aiMentionService: AiMentionService,
  ) {}

  async streamChat(params: {
    user: Usuario;
    messages: UIMessage[];
    threadId?: string;
    mentions?: AiMentionDto[];
    mode?: AiChatMode;
    thinking?: boolean;
    res: Response;
  }): Promise<{ threadId: string }> {
    const userId = Number(params.user.id);
    const mode: AiChatMode = params.mode ?? 'normal';
    // Análise sempre roda com raciocínio; a UI já trava o toggle, aqui é a garantia.
    const thinking = mode === 'analitico' ? true : Boolean(params.thinking);
    const validatedMentions = await this.aiMentionService.validateMentions(
      userId,
      params.mentions ?? [],
    );

    const thread = await this.aiChatPersistenceService.resolveThread(
      userId,
      params.threadId,
    );

    const lastMessage = params.messages.at(-1);
    let truncatedTitle: string | null = null;

    if (lastMessage?.role === 'user') {
      await this.aiChatPersistenceService.saveUserMessage(
        thread.id,
        lastMessage,
        validatedMentions.length > 0 ? { mentions: validatedMentions } : {},
      );
      truncatedTitle = await this.aiChatPersistenceService.maybeSetTruncatedTitle(
        thread.id,
        lastMessage,
      );
    }

    const lastUserPlain =
      lastMessage?.role === 'user' ? extractTextFromUIMessage(lastMessage) : '';
    const blockedReportNames =
      await this.aiReportToolsService.findReportNamesWithoutAiInText(
        userId,
        lastUserPlain,
      );

    if (blockedReportNames.length > 0) {
      return this.streamFixedAssistantReply({
        res: params.res,
        threadId: thread.id,
        text: this.aiReportToolsService.buildBlockedReportRefusalMessage(
          blockedReportNames,
        ),
        truncatedTitle,
      });
    }

    const firstUserMessage = params.messages.find((message) => message.role === 'user');
    const firstUserText = firstUserMessage
      ? extractTextFromUIMessage(firstUserMessage)
      : '';

    const isAdmin = await this.aiAccessService.isAdmin(userId);
    const canManageUsers = await this.aiAccessService.canMentionUsers(userId);
    const reportCatalog =
      await this.aiReportToolsService.getReportCatalogForPrompt(userId);
    const mentionsSection =
      await this.aiMentionService.buildMentionsPromptSection(
        userId,
        validatedMentions,
        { mode },
      );
    const mentionUserPrefix =
      await this.aiMentionService.buildMentionUserPrefix(
        userId,
        validatedMentions,
        { mode },
      );
    const messagesForModel = this.withMentionPrefixOnLastUserMessage(
      params.messages,
      mentionUserPrefix,
    );

    // Gráficos / plano: escritos no stream assim que a tool termina e persistidos
    // nas parts da mensagem (mesmo padrão data-chart), para o card aparecer ao vivo.
    const emittedCharts: Array<{ id: string; spec: AiChartSpec }> = [];
    const emittedPlans: AiPlan[] = [];
    let chartWriter: UIMessageStreamWriter | null = null;

    const emitChart = (spec: AiChartSpec) => {
      const id = randomUUID();
      emittedCharts.push({ id, spec });
      chartWriter?.write({ type: 'data-chart', id, data: spec });
    };

    const emitPlan = (plan: AiPlan) => {
      emittedPlans.push(plan);
      chartWriter?.write({
        type: 'data-plan',
        id: plan.id,
        data: plan,
      });
    };

    // Plano proposto na fase analítica — também gravado em metadata.
    let proposedPlan: AiPlan | null = null;

    const tools = {
      ...(mode === 'analitico'
        ? {
            ...buildPlanningReportToolSet({
              reportTools: this.aiReportToolsService,
              userId,
            }),
            ...buildPlanProposalTool({
              getExistingPlan: () => proposedPlan,
              onPropose: (proposal) => {
                if (proposedPlan) {
                  return proposedPlan;
                }
                proposedPlan = this.aiPlanService.createPlanFromProposal(proposal);
                emitPlan(proposedPlan);
                return proposedPlan;
              },
              afterPropose: async (plan) => {
                if (await this.aiPlanService.hasPersistedPlan(thread.id, plan.id)) {
                  return;
                }
                await this.aiPlanService.persistProposedPlanMessage(
                  thread.id,
                  plan,
                );
              },
            }),
            ...(canManageUsers
              ? buildUserDomainAnalyticsToolSet({
                  adminTools: this.aiAdminToolsService,
                  userId,
                  emitChart,
                })
              : {}),
          }
        : {
            ...this.buildReportTools(userId),
            ...(canManageUsers && !isAdmin
              ? this.buildUserManagementTools(userId)
              : {}),
            ...(isAdmin ? this.buildAdminTools(userId) : {}),
          }),
    };

    const responseHeaders: Record<string, string> = {
      'X-Thread-Id': thread.id,
    };

    if (truncatedTitle) {
      responseHeaders['X-Thread-Title'] = truncatedTitle;
    }

    const asksCapabilities = asksCapabilityQuestion(lastUserPlain);
    const asksRelation =
      /rela[cç][aã]o|cruzar|cruzamento|possuem|possuem|que\s+t[eê]m|que\s+possuem/i.test(
        lastUserPlain,
      );
    const asksCountOnly =
      /quantos?\s+/i.test(lastUserPlain) &&
      !asksRelation &&
      !/privad|ativ|lista|relacione|crie/i.test(lastUserPlain);

    const dashboardMentionWithFacts = validatedMentions.some(
      (m) => m.type === 'dashboard' && mentionUserPrefix.includes('data_criacao='),
    );
    const usersDomainWithFacts = validatedMentions.some(
      (m) =>
        m.type === 'dominio_usuarios' && mentionUserPrefix.includes('total='),
    );
    const reportsDomainWithFacts = validatedMentions.some(
      (m) =>
        m.type === 'dominio_relatorios' && mentionUserPrefix.includes('total='),
    );
    const preferMentionFactsOnly =
      asksCapabilities ||
      (!asksRelation &&
        (dashboardMentionWithFacts ||
          ((usersDomainWithFacts || reportsDomainWithFacts) && asksCountOnly)));

    const capabilityPrefix = asksCapabilities
      ? isAdmin
        ? '[Instrução de segurança] O usuário perguntou o que você pode fazer. Responda em português do Brasil, em linguagem de negócio (relatórios, dashboards, usuários, métricas, jobs). PROIBIDO citar nomes técnicos de funções/tools (camelCase), identificadores internos ou parâmetros de API. Não invente capacidades.'
        : canManageUsers
          ? '[Instrução de segurança] O usuário perguntou o que você pode fazer. Responda em português do Brasil descrevendo: consultar/listar/interpretar relatórios autorizados e listar/consultar usuários do sistema. PROIBIDO mencionar métricas globais, jobs ou infraestrutura. PROIBIDO citar nomes técnicos de funções/tools. Não invente capacidades.'
          : '[Instrução de segurança] O usuário perguntou o que você pode fazer. Responda em português do Brasil descrevendo APENAS: consultar/listar/interpretar os relatórios autorizados no catálogo. PROIBIDO mencionar usuários do sistema, métricas globais, jobs, infraestrutura ou qualquer capacidade administrativa. PROIBIDO citar nomes técnicos de funções/tools. Não invente capacidades.'
      : '';
    const messagesForCapabilities = this.withMentionPrefixOnLastUserMessage(
      messagesForModel,
      capabilityPrefix,
    );

    const modelMessages = await convertToModelMessages(messagesForCapabilities);
    const systemPrompt = this.aiChatPersistenceService.buildSystemPrompt(
      params.user,
      reportCatalog,
      { isAdmin, canManageUsers, mentionsSection, mode },
    );

    const reasoningEnabled = thinking && this.aiService.supportsReasoning();
    const nvidiaChatTemplateContext = {
      enableThinking: reasoningEnabled,
      forceNonemptyContent:
        !preferMentionFactsOnly && Object.keys(tools).length > 0,
    };

    const runStreamText = () =>
      streamText({
        model: this.aiService.getChatModel({ thinking: reasoningEnabled }),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        providerOptions: reasoningEnabled
          ? this.aiService.getReasoningProviderOptions()
          : undefined,
        // Modelos pequenos (Ollama) frequentemente escrevem tool-calls como texto JSON
        // ou alucinam contagens (ex.: limit=50). Com metadados já no prompt, desliga tools.
        ...(preferMentionFactsOnly
          ? { toolChoice: 'none' as const }
          : mode === 'analitico'
            ? // Força tool na 1ª etapa; depois o modelo pode responder em texto.
              { toolChoice: 'auto' as const }
            : {}),
        stopWhen: stepCountIs(env.AI_MAX_STEPS),
        onFinish: async ({ text }) => {
          const shouldRefineTitle =
            await this.aiChatPersistenceService.canRefineTitle(thread.id);
          const chartParts = emittedCharts.map(({ id, spec }) => ({
            type: 'data-chart' as const,
            id,
            data: spec,
          }));
          const planParts = emittedPlans.map((plan) => ({
            type: 'data-plan' as const,
            id: plan.id,
            data: plan,
          }));

          if (
            !text?.trim() &&
            chartParts.length === 0 &&
            planParts.length === 0 &&
            !proposedPlan
          ) {
            if (shouldRefineTitle && firstUserText) {
              void this.refineThreadTitle(thread.id, firstUserText);
            }
            return;
          }

          let safeText = text ?? '';
          if (proposedPlan || planParts.length > 0) {
            // Evita duplicar o plano em markdown quando a tool já criou o card.
            safeText =
              'Preparei um plano de análise. Responda as perguntas no card abaixo, ajuste os passos se quiser e aprove para eu executar.';
          } else if (looksLikeLeakedToolCallJson(safeText)) {
            const recovered = await this.tryRecoverLeakedToolCall(
              userId,
              safeText,
            );
            safeText = recovered ?? sanitizeAssistantText(safeText);
          } else {
            safeText = sanitizeAssistantText(safeText);
          }

          if (!safeText.trim() && (chartParts.length > 0 || planParts.length > 0 || proposedPlan)) {
            safeText =
              proposedPlan || planParts.length > 0
                ? 'Preparei um plano de análise. Responda as perguntas no card abaixo, ajuste os passos se quiser e aprove para eu executar.'
                : '';
          }

          const metadata: Record<string, unknown> = {};
          if (proposedPlan) {
            metadata.plan = { ...proposedPlan };
          } else if (emittedPlans[0]) {
            metadata.plan = { ...emittedPlans[0] };
          }

          // Plano já foi persistido na tool; evita mensagem duplicada.
          if (proposedPlan) {
            const alreadySaved = await this.aiPlanService.hasPersistedPlan(
              thread.id,
              proposedPlan.id,
            );
            if (alreadySaved) {
              if (shouldRefineTitle && firstUserText) {
                void this.refineThreadTitle(thread.id, firstUserText);
              }
              return;
            }
          }

          await this.aiChatPersistenceService.saveAssistantMessage(
            thread.id,
            {
              id: randomUUID(),
              role: 'assistant',
              parts: [
                ...chartParts,
                ...planParts,
                ...(safeText.trim()
                  ? [{ type: 'text' as const, text: safeText }]
                  : []),
              ],
            },
            metadata,
          );

          if (shouldRefineTitle && firstUserText) {
            void this.refineThreadTitle(thread.id, firstUserText);
          }
        },
      });

    const stream = createUIMessageStream({
      execute: ({ writer }) =>
        runWithNvidiaChatTemplateContext(nvidiaChatTemplateContext, () => {
          chartWriter = writer;
          const result = runStreamText();
          const uiStream = toUIMessageStream({ stream: result.stream });

          writer.merge(
            createSanitizedUiMessageStream(uiStream, (leakedText) =>
              this.tryRecoverLeakedToolCall(userId, leakedText).then(
                (recovered) => recovered ?? sanitizeAssistantText(leakedText),
              ),
            ),
          );
        }),
      onError: () =>
        'Não foi possível concluir a resposta. Tente novamente ou inicie uma nova conversa.',
    });

    pipeUIMessageStreamToResponse({
      response: params.res,
      stream,
      headers: responseHeaders,
    });

    return { threadId: thread.id };
  }

  /** Injeta fatos de @menção só na mensagem enviada ao modelo (não altera o que foi persistido). */
  private withMentionPrefixOnLastUserMessage(
    messages: UIMessage[],
    prefix: string,
  ): UIMessage[] {
    const trimmed = prefix.trim();
    if (!trimmed) {
      return messages;
    }

    const lastIndex = messages.length - 1;
    const last = messages[lastIndex];
    if (!last || last.role !== 'user') {
      return messages;
    }

    let prefixed = false;
    const parts = last.parts.map((part) => {
      if (part.type === 'text' && !prefixed) {
        prefixed = true;
        return { ...part, text: `${trimmed}\n\n${part.text}` };
      }
      return part;
    });

    if (!prefixed) {
      parts.unshift({ type: 'text', text: trimmed });
    }

    const next = [...messages];
    next[lastIndex] = { ...last, parts };
    return next;
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

  private async streamFixedAssistantReply(params: {
    res: Response;
    threadId: string;
    text: string;
    truncatedTitle?: string | null;
  }): Promise<{ threadId: string }> {
    const messageId = randomUUID();
    const responseHeaders: Record<string, string> = {
      'X-Thread-Id': params.threadId,
    };

    if (params.truncatedTitle) {
      responseHeaders['X-Thread-Title'] = params.truncatedTitle;
    }

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: messageId });
        writer.write({ type: 'text-delta', id: messageId, delta: params.text });
        writer.write({ type: 'text-end', id: messageId });
      },
      onEnd: async () => {
        await this.aiChatPersistenceService.saveAssistantMessage(params.threadId, {
          id: messageId,
          role: 'assistant',
          parts: [{ type: 'text', text: params.text }],
        });
      },
    });

    pipeUIMessageStreamToResponse({
      response: params.res,
      stream,
      headers: responseHeaders,
    });

    return { threadId: params.threadId };
  }

  private buildReportTools(userId: number) {
    return buildReportToolSet({
      reportTools: this.aiReportToolsService,
      userId,
    });
  }

  private buildUserManagementTools(userId: number) {
    return {
      listarUsuariosSistema: tool({
        description:
          'Lista usuários do sistema (requer REGRA_USUARIO ou admin). Retorna { total, usuarios }. Use o campo total como quantidade real. O parâmetro limit é só tamanho de página (padrão 50) e NÃO é o total de usuários. No banco, nome e sobrenome são campos separados — use filter com qualquer parte (ex.: "Gabriel", "Souza" ou "Gabriel Souza") ou informe nome e/ou sobrenome nos parâmetros dedicados. Para contar apenas usuários ativos, filtre os não bloqueados via o argumento booleano correspondente — NUNCA explique esse argumento ao usuário; diga apenas "usuários ativos". Não retorna preferências de UI.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          filter: z
            .string()
            .optional()
            .describe(
              'Busca por nome, sobrenome, nome completo ou e-mail. Ex.: "Gabriel" ou "Gabriel Souza".',
            ),
          nome: z
            .string()
            .optional()
            .describe('Primeiro nome (campo separado no banco).'),
          sobrenome: z
            .string()
            .optional()
            .describe('Sobrenome (campo separado no banco).'),
          bloqueado: z
            .boolean()
            .optional()
            .describe(
              'Filtro interno: false = só ativos, true = só bloqueados. Nunca mencione este nome ao usuário.',
            ),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.listUsers(userId, params),
      }),
      obterUsuarioSistema: tool({
        description:
          'Obtém acesso efetivo de um usuário por ID (requer REGRA_USUARIO ou admin). Retorna regras RBAC, permissões, relatoriosPrivadosComAcesso, dashboardsPrivadosComAcesso (concessão explícita), relatoriosPublicosAcessiveis e dashboardsPublicosAcessiveis. Não inclui itens disponíveis sem concessão.',
        inputSchema: z.object({
          usuarioId: z.number().int().positive(),
        }),
        execute: async ({ usuarioId }) =>
          this.aiAdminToolsService.getUser(userId, usuarioId),
      }),
    };
  }

  private buildAdminTools(userId: number) {
    return {
      ...this.buildUserManagementTools(userId),
      relacionarAcessosUsuarios: tool({
        description:
          'Relaciona usuários com dashboards/relatórios privados (admin). Retorna: relatoriosPrivadosNoSistema (catálogo de TODOS os relatórios privados + quem tem acesso), dashboardsPrivadosNoSistemaTotal, e relacoes por usuário. SEMPRE apresente primeiro o catálogo de relatórios privados; depois a relação por usuário. Prefira esta tool em vez de N chamadas a obterUsuarioSistema.',
        inputSchema: z.object({
          somenteAtivos: z.boolean().optional(),
          exigirDashboardsPrivados: z.boolean().optional(),
          exigirRelatoriosPrivados: z.boolean().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.relateUsersPrivateAccess(userId, params),
      }),
      listarRelatoriosSistema: tool({
        description:
          'Lista inventário administrativo de relatórios cadastrados (admin): metadados de cadastro, privacidade e se conhecimentoIaHabilitado=true para o usuário atual. Use para perguntas administrativas sobre cadastro/estado. NÃO use para obter linhas de dados — somente consultarRelatorio/descreverRelatorio em relatórios com conhecimento IA no catálogo autorizado.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.listReports(userId, params),
      }),
      listarDashboardsSistema: tool({
        description:
          'Lista dashboards do sistema (admin). Inclui data_criacao e data_atualizacao. Não inclui URLs.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) =>
          this.aiAdminToolsService.listDashboards(userId, params),
      }),
      obterDashboardSistema: tool({
        description:
          'Obtém detalhes de um dashboard por ID (admin): nome, privacidade, data_criacao, data_atualizacao. Não inclui URL. Use quando o usuário mencionar um dashboard específico.',
        inputSchema: z.object({
          dashboardId: z.number().int().positive(),
        }),
        execute: async ({ dashboardId }) =>
          this.aiAdminToolsService.getDashboard(userId, dashboardId),
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

  private async tryRecoverLeakedToolCall(
    userId: number,
    leakedText: string,
  ): Promise<string | null> {
    const parsed = tryParseLeakedFunctionXml(leakedText);
    if (!parsed) {
      return null;
    }

    if (parsed.name !== 'listarUsuariosSistema') {
      return null;
    }

    const filter =
      parsed.args.filter?.trim() ||
      [parsed.args.nome, parsed.args.sobrenome]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim() ||
      undefined;

    const bloqueado =
      parsed.args.bloqueado === 'true'
        ? true
        : parsed.args.bloqueado === 'false'
          ? false
          : undefined;

    const result = await this.aiAdminToolsService.listUsers(userId, {
      filter,
      nome: parsed.args.nome,
      sobrenome: parsed.args.sobrenome,
      bloqueado,
    });

    return this.formatListUsersRecovery(result, filter);
  }

  private formatListUsersRecovery(
    result: { total: number; usuarios: Array<{ nome: string; sobrenome: string; email: string }> },
    filter?: string,
  ): string {
    if (result.total === 0) {
      const term = filter?.trim();
      return term
        ? `Não encontrei usuário cadastrado com o nome ou e-mail "${term}".`
        : 'Não encontrei usuários com esse critério.';
    }

    if (result.total === 1) {
      const user = result.usuarios[0];
      return `Sim, existe o usuário ${user.nome} ${user.sobrenome} (${user.email}).`;
    }

    const preview = result.usuarios
      .slice(0, 10)
      .map((user) => `${user.nome} ${user.sobrenome}`)
      .join(', ');
    const suffix =
      result.total > 10 ? ` e mais ${result.total - 10} usuário(s)` : '';
    return `Encontrei ${result.total} usuários: ${preview}${suffix}.`;
  }
}
