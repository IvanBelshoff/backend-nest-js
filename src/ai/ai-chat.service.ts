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
import { AiMentionService } from './ai-mention.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { AiThreadTitleService } from './ai-thread-title.service';
import { extractTextFromUIMessage } from './ai-thread-title.util';
import type { AiMentionDto } from './dto/ai-chat.dto';

/** Detecta tool-call vazado como texto (comum em modelos Ollama / Nemotron). */
function looksLikeLeakedToolCallJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (/<tool_call>|<\/?function=/i.test(trimmed)) {
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

function sanitizeAssistantText(text: string): string {
  if (looksLikeLeakedToolCallJson(text)) {
    return 'Não consegui formatar a resposta. Tente perguntar de novo ou use Nova conversa.';
  }
  return redactInternalLeakageInText(redactToolNamesInText(text));
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

function redactToolNamesFromUiMessageStream<T extends Record<string, unknown>>(
  stream: ReadableStream<T>,
): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (!chunk || typeof chunk !== 'object') {
          controller.enqueue(chunk);
          return;
        }

        if (typeof chunk.delta === 'string') {
          controller.enqueue({
            ...chunk,
            delta: redactInternalLeakageInText(redactToolNamesInText(chunk.delta), {
              collapseWhitespace: false,
            }),
          });
          return;
        }

        if (typeof chunk.text === 'string') {
          controller.enqueue({
            ...chunk,
            text: redactInternalLeakageInText(redactToolNamesInText(chunk.text), {
              collapseWhitespace: false,
            }),
          });
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
    private readonly aiThreadTitleService: AiThreadTitleService,
    private readonly aiMentionService: AiMentionService,
  ) {}

  async streamChat(params: {
    user: Usuario;
    messages: UIMessage[];
    threadId?: string;
    mentions?: AiMentionDto[];
    res: Response;
  }): Promise<{ threadId: string }> {
    const userId = Number(params.user.id);
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
      );
    const mentionUserPrefix =
      await this.aiMentionService.buildMentionUserPrefix(
        userId,
        validatedMentions,
      );
    const messagesForModel = this.withMentionPrefixOnLastUserMessage(
      params.messages,
      mentionUserPrefix,
    );

    const tools = {
      ...this.buildReportTools(userId),
      ...(canManageUsers && !isAdmin
        ? this.buildUserManagementTools(userId)
        : {}),
      ...(isAdmin ? this.buildAdminTools(userId) : {}),
    };

    const responseHeaders: Record<string, string> = {
      'X-Thread-Id': thread.id,
    };

    if (truncatedTitle) {
      responseHeaders['X-Thread-Title'] = truncatedTitle;
    }

    const lastUserPlain = lastMessage?.role === 'user'
      ? extractTextFromUIMessage(lastMessage)
      : '';
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

    const result = streamText({
      model: this.aiService.getChatModel(),
      system: this.aiChatPersistenceService.buildSystemPrompt(
        params.user,
        reportCatalog,
        { isAdmin, canManageUsers, mentionsSection },
      ),
      messages: await convertToModelMessages(messagesForCapabilities),
      tools,
      // Modelos pequenos (Ollama) frequentemente escrevem tool-calls como texto JSON
      // ou alucinam contagens (ex.: limit=50). Com metadados já no prompt, desliga tools.
      ...(preferMentionFactsOnly ? { toolChoice: 'none' as const } : {}),
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

        const safeText = sanitizeAssistantText(text);

        await this.aiChatPersistenceService.saveAssistantMessage(thread.id, {
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: safeText }],
        });

        if (shouldRefineTitle && firstUserText) {
          void this.refineThreadTitle(thread.id, firstUserText);
        }
      },
    });

    const uiStream = toUIMessageStream({ stream: result.stream });
    const redactedStream = redactToolNamesFromUiMessageStream(uiStream);

    pipeUIMessageStreamToResponse({
      response: params.res,
      stream: redactedStream,
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

  private buildReportTools(userId: number) {
    return {
      listarRelatoriosDisponiveis: tool({
        description:
          'Lista relatórios autorizados e a contagem. Retorna { total, relatorios (nomes), referenciaInterna }. Use o campo total para "quantos relatórios". Não verbalize IDs/estado ao usuário.',
        inputSchema: z.object({}),
        execute: async () =>
          this.aiReportToolsService.listAvailableReports(userId),
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

  private buildUserManagementTools(userId: number) {
    return {
      listarUsuariosSistema: tool({
        description:
          'Lista usuários do sistema (requer REGRA_USUARIO ou admin). Retorna { total, usuarios }. Use o campo total como quantidade real. O parâmetro limit é só tamanho de página (padrão 50) e NÃO é o total de usuários. Use filter com nome ou e-mail. Para contar apenas usuários ativos, filtre os não bloqueados via o argumento booleano correspondente — NUNCA explique esse argumento ao usuário; diga apenas "usuários ativos". Não retorna preferências de UI.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          filter: z.string().optional(),
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
          'Lista todos os relatórios cadastrados no sistema (admin). Retorna { total, relatorios }. Use o campo total para "quantos relatórios existem". O parâmetro limit é só tamanho de página. Não inclui query SQL.',
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
}
