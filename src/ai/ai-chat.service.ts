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

/** Detecta tool-call vazado como texto (comum em modelos Ollama pequenos). */
function looksLikeLeakedToolCallJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      name?: unknown;
      arguments?: unknown;
    };
    return typeof parsed.name === 'string' && parsed.arguments != null;
  } catch {
    return false;
  }
}

function sanitizeAssistantText(text: string): string {
  if (looksLikeLeakedToolCallJson(text)) {
    return 'Não consegui formatar a resposta. Tente perguntar de novo ou use Nova conversa.';
  }
  return text;
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

    // #region agent log
    {
      const fs = await import('node:fs');
      const lastForModel = messagesForModel.at(-1);
      const lastText =
        lastForModel?.role === 'user'
          ? extractTextFromUIMessage(lastForModel).slice(0, 300)
          : '';
      const line = JSON.stringify({
        sessionId: '07dd47',
        runId: 'post-fix',
        hypothesisId: 'A',
        location: 'ai-chat.service.ts:streamChat',
        message: 'reports domain routing context',
        data: {
          isAdmin,
          catalogCount: reportCatalog.length,
          validatedMentions: validatedMentions.map((m) => ({
            type: m.type,
            id: m.id ?? null,
            label: m.label,
          })),
          reportsDomainMention: validatedMentions.some(
            (m) => m.type === 'dominio_relatorios',
          ),
          prefixHasTotal: mentionUserPrefix.includes('total='),
          prefixPreview: mentionUserPrefix.slice(0, 280),
          mentionsSectionPreview: mentionsSection.slice(0, 280),
          lastUserMessagePreview: lastText,
          asksHowManyReports:
            /quantos?\s+relat[oó]rios/i.test(lastText) ||
            /relat[oó]rios\s+existem/i.test(lastText),
        },
        timestamp: Date.now(),
      });
      try {
        fs.appendFileSync(
          '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-07dd47.log',
          `${line}\n`,
        );
      } catch {
        /* ignore */
      }
    }
    // #endregion

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
      dashboardMentionWithFacts ||
      usersDomainWithFacts ||
      reportsDomainWithFacts;
    const availableToolNames = Object.keys(tools);

    const result = streamText({
      model: this.aiService.getChatModel(),
      system: this.aiChatPersistenceService.buildSystemPrompt(
        params.user,
        reportCatalog,
        { isAdmin, mentionsSection },
      ),
      messages: await convertToModelMessages(messagesForModel),
      tools,
      // Modelos pequenos (Ollama) frequentemente escrevem tool-calls como texto JSON
      // ou alucinam contagens (ex.: limit=50). Com metadados já no prompt, desliga tools.
      ...(preferMentionFactsOnly ? { toolChoice: 'none' as const } : {}),
      stopWhen: stepCountIs(env.AI_MAX_STEPS),
      onStepFinish: async (step) => {
        // #region agent log
        {
          const fs = await import('node:fs');
          const toolCalls = (step.toolCalls ?? [])
            .filter((tc): tc is NonNullable<typeof tc> => tc != null)
            .map((tc) => ({
              toolName: 'toolName' in tc ? tc.toolName : null,
              type: tc.type,
            }));
          const line = JSON.stringify({
            sessionId: '07dd47',
            runId: 'post-fix',
            hypothesisId: 'B',
            location: 'ai-chat.service.ts:onStepFinish',
            message: 'model step finished',
            data: {
              finishReason: step.finishReason,
              toolCallCount: toolCalls.length,
              toolCalls,
              textPreview: (step.text ?? '').slice(0, 200),
            },
            timestamp: Date.now(),
          });
          try {
            fs.appendFileSync(
              '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-07dd47.log',
              `${line}\n`,
            );
          } catch {
            /* ignore */
          }
        }
        // #endregion
      },
      onFinish: async ({ text, steps }) => {
        // #region agent log
        {
          const fs = await import('node:fs');
          const trimmed = (text ?? '').trim();
          const allToolNames = (steps ?? []).flatMap((s) =>
            (s.toolCalls ?? [])
              .filter((tc): tc is NonNullable<typeof tc> => tc != null)
              .map((tc) =>
                'toolName' in tc ? String(tc.toolName) : 'unknown',
              ),
          );
          const line = JSON.stringify({
            sessionId: '07dd47',
            runId: 'post-fix',
            hypothesisId: 'B',
            location: 'ai-chat.service.ts:onFinish',
            message: 'assistant finish with tool usage',
            data: {
              textLength: trimmed.length,
              textPreview: trimmed.slice(0, 280),
              looksLikeToolJson: looksLikeLeakedToolCallJson(trimmed),
              sanitizedWouldTrigger: looksLikeLeakedToolCallJson(trimmed),
              toolChoiceNone: preferMentionFactsOnly,
              reportsDomainWithFacts,
              catalogTotalInPrompt: reportCatalog.length,
              availableToolNames,
              calledToolNames: allToolNames,
              calledListarDisponiveis: allToolNames.includes(
                'listarRelatoriosDisponiveis',
              ),
              calledListarSistema: allToolNames.includes(
                'listarRelatoriosSistema',
              ),
              calledNoTools: allToolNames.length === 0,
              asksToConsultDb:
                /consultar|banco de dados|gostaria que eu/i.test(trimmed),
              answersWithCatalogTotal: new RegExp(
                `\\b${reportCatalog.length}\\b`,
              ).test(trimmed),
            },
            timestamp: Date.now(),
          });
          try {
            fs.appendFileSync(
              '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-07dd47.log',
              `${line}\n`,
            );
          } catch {
            /* ignore */
          }
        }
        // #endregion

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

    pipeUIMessageStreamToResponse({
      response: params.res,
      stream: toUIMessageStream({ stream: result.stream }),
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
        execute: async () => {
          const result =
            await this.aiReportToolsService.listAvailableReports(userId);
          // #region agent log
          {
            const fs = await import('node:fs');
            const line = JSON.stringify({
              sessionId: '07dd47',
              runId: 'post-fix',
              hypothesisId: 'C',
              location: 'ai-chat.service.ts:listarRelatoriosDisponiveis',
              message: 'list available reports tool executed',
              data: {
                executed: true,
                count: result.relatorios?.length ?? 0,
                resultTotal: result.total,
                hasTotalField: Object.prototype.hasOwnProperty.call(
                  result,
                  'total',
                ),
              },
              timestamp: Date.now(),
            });
            try {
              fs.appendFileSync(
                '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-07dd47.log',
                `${line}\n`,
              );
            } catch {
              /* ignore */
            }
          }
          // #endregion
          return result;
        },
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
          'Lista usuários do sistema (admin). Retorna { total, usuarios }. Use o campo total como quantidade real. O parâmetro limit é só tamanho de página (padrão 50) e NÃO é o total de usuários. Use filter com nome ou e-mail. Não retorna preferências de UI.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          filter: z.string().optional(),
        }),
        execute: async (params) => {
          const result = await this.aiAdminToolsService.listUsers(
            userId,
            params,
          );
          // #region agent log
          {
            const fs = await import('node:fs');
            const line = JSON.stringify({
              sessionId: 'dcbb51',
              runId: 'post-fix-4',
              hypothesisId: 'J',
              location: 'ai-chat.service.ts:listarUsuariosSistema',
              message: 'list users tool executed',
              data: {
                executed: true,
                requestedLimit: params.limit ?? null,
                resultTotal: result.total,
                resultCount: result.usuarios.length,
              },
              timestamp: Date.now(),
            });
            try {
              fs.appendFileSync(
                '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-dcbb51.log',
                `${line}\n`,
              );
            } catch {
              /* ignore */
            }
          }
          // #endregion
          return result;
        },
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
          'Lista todos os relatórios cadastrados no sistema (admin). Retorna { total, relatorios }. Use o campo total para "quantos relatórios existem". O parâmetro limit é só tamanho de página. Não inclui query SQL.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) => {
          const result = await this.aiAdminToolsService.listReports(
            userId,
            params,
          );
          // #region agent log
          {
            const fs = await import('node:fs');
            const line = JSON.stringify({
              sessionId: '07dd47',
              runId: 'post-fix',
              hypothesisId: 'D',
              location: 'ai-chat.service.ts:listarRelatoriosSistema',
              message: 'list system reports tool executed',
              data: {
                executed: true,
                resultTotal: result.total,
                pageCount: result.relatorios?.length ?? 0,
              },
              timestamp: Date.now(),
            });
            try {
              fs.appendFileSync(
                '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-07dd47.log',
                `${line}\n`,
              );
            } catch {
              /* ignore */
            }
          }
          // #endregion
          return result;
        },
      }),
      listarDashboardsSistema: tool({
        description:
          'Lista dashboards do sistema (admin). Inclui data_criacao e data_atualizacao. Não inclui URLs.',
        inputSchema: z.object({
          page: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(100).optional(),
          nome: z.string().optional(),
        }),
        execute: async (params) => {
          const result = await this.aiAdminToolsService.listDashboards(
            userId,
            params,
          );
          // #region agent log
          {
            const fs = await import('node:fs');
            const sample = result.dashboards?.[0];
            const line = JSON.stringify({
              sessionId: 'dcbb51',
              runId: 'post-fix',
              hypothesisId: 'C',
              location: 'ai-chat.service.ts:listarDashboardsSistema',
              message: 'dashboard list tool result shape',
              data: {
                total: result.total,
                sampleKeys: sample ? Object.keys(sample) : [],
                sampleHasDataCriacao: sample
                  ? Object.prototype.hasOwnProperty.call(sample, 'data_criacao')
                  : false,
              },
              timestamp: Date.now(),
            });
            try {
              fs.appendFileSync(
                '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-dcbb51.log',
                `${line}\n`,
              );
            } catch {
              /* ignore */
            }
          }
          // #endregion
          return result;
        },
      }),
      obterDashboardSistema: tool({
        description:
          'Obtém detalhes de um dashboard por ID (admin): nome, privacidade, data_criacao, data_atualizacao. Não inclui URL. Use quando o usuário mencionar um dashboard específico.',
        inputSchema: z.object({
          dashboardId: z.number().int().positive(),
        }),
        execute: async ({ dashboardId }) => {
          // #region agent log
          {
            const fs = await import('node:fs');
            const line = JSON.stringify({
              sessionId: 'dcbb51',
              runId: 'post-fix-3',
              hypothesisId: 'G',
              location: 'ai-chat.service.ts:obterDashboardSistema',
              message: 'dashboard detail tool executed',
              data: { dashboardId, executed: true },
              timestamp: Date.now(),
            });
            try {
              fs.appendFileSync(
                '/Users/ivanbelshoff/Desktop/Projetos Pessoais/NewDataDash/.cursor/debug-dcbb51.log',
                `${line}\n`,
              );
            } catch {
              /* ignore */
            }
          }
          // #endregion
          return this.aiAdminToolsService.getDashboard(userId, dashboardId);
        },
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
