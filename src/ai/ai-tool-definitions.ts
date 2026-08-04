import { tool } from 'ai';
import { z } from 'zod';
import type { AiAnalyticsToolsService } from './ai-analytics-tools.service';
import type { AiAdminToolsService } from './ai-admin-tools.service';
import type { AiExplorationToolsService } from './ai-exploration-tools.service';
import {
  ANALYTICS_AGGREGATIONS,
  ANALYTICS_GRANULARITIES,
  OUTLIER_METHODS,
} from './ai-analytics.types';
import type { AiChartSpec } from './ai-chart-spec.schema';
import type { AiTableSpec } from './ai-table-spec.schema';
import type { AiReportToolsService } from './ai-report-tools.service';
import {
  aiPlanProposalSchema,
  type AiPlan,
  type AiPlanProposal,
} from './plan/ai-plan.schema';

/**
 * Definições de tools compartilhadas entre o chat em streaming
 * (`AiChatService`) e a análise em fila (`AiAnalysisService`), para que as duas
 * entradas ofereçam ao modelo exatamente as mesmas ferramentas e descrições.
 */
export function buildReportToolSet(params: {
  reportTools: AiReportToolsService;
  userId: number;
}) {
  const { reportTools, userId } = params;

  return {
    listarRelatoriosDisponiveis: tool({
      description:
        'Lista relatórios autorizados e a contagem. Retorna { total, relatorios (nomes), referenciaInterna }. Use o campo total para "quantos relatórios". Não verbalize IDs/estado ao usuário.',
      inputSchema: z.object({}),
      execute: async () => reportTools.listAvailableReports(userId),
    }),
    descreverRelatorio: tool({
      description:
        'Retorna metadados de um relatório (nome, colunas, parâmetros, estado). Informe estado online/offline ao usuário somente se ele perguntar explicitamente.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
      }),
      execute: async ({ relatorioId }) =>
        reportTools.describeReport(userId, relatorioId),
    }),
    consultarRelatorio: tool({
      description:
        'Consulta dados de um relatório autorizado. Online = query no banco; offline = snapshot. Retorna linhas e total com fonte citável.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        parametros: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ relatorioId, parametros }) =>
        reportTools.queryReport(userId, relatorioId, parametros ?? {}),
    }),
  };
}

/** Catálogo leve para a fase de planejamento (sem SQL pesado). */
export function buildPlanningReportToolSet(params: {
  reportTools: AiReportToolsService;
  userId: number;
}) {
  const { reportTools, userId } = params;

  return {
    listarRelatoriosDisponiveis: tool({
      description:
        'Lista relatórios autorizados e a contagem. Retorna { total, relatorios (nomes), referenciaInterna }. Use o campo total para "quantos relatórios". Não verbalize IDs/estado ao usuário.',
      inputSchema: z.object({}),
      execute: async () => reportTools.listAvailableReports(userId),
    }),
    descreverRelatorio: tool({
      description:
        'Retorna metadados de um relatório (nome, colunas, parâmetros, estado). Confirme nomes reais de colunas antes de montar o plano.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
      }),
      execute: async ({ relatorioId }) =>
        reportTools.describeReport(userId, relatorioId),
    }),
  };
}

export function buildPlanProposalTool(params: {
  onPropose: (proposal: AiPlanProposal) => AiPlan;
  afterPropose?: (plan: AiPlan) => Promise<void>;
  getExistingPlan?: () => AiPlan | null;
}) {
  return {
    proporPlanoAnalise: tool({
      description:
        'OBRIGATÓRIA no modo analítico para qualquer pedido de análise. Cria o card interativo de plano (perguntas A/B/C/Outra + passos) no frontend. NÃO escreva o plano em texto — só chame esta tool. Inclua sempre uma opção com label "Outra" em cada pergunta. Chame UMA ÚNICA VEZ por pedido — não repita. Não execute a análise aqui.',
      inputSchema: aiPlanProposalSchema,
      execute: async (proposal) => {
        const existing = params.getExistingPlan?.() ?? null;
        if (existing) {
          return {
            status: existing.status,
            planId: existing.id,
            aviso:
              'Plano já criado nesta resposta. Peça ao usuário para usar o card existente e aprovar — não crie outro plano.',
            objetivo: existing.objetivo,
            perguntas: existing.perguntas.length,
            passos: existing.passos.length,
          };
        }

        const plan = params.onPropose(proposal);
        if (params.afterPropose) {
          await params.afterPropose(plan);
        }
        return {
          status: plan.status,
          planId: plan.id,
          aviso:
            'Plano enviado ao card interativo. No texto da resposta diga só uma frase pedindo para o usuário responder o card e aprovar. NÃO repita o plano em markdown.',
          objetivo: plan.objetivo,
          perguntas: plan.perguntas.length,
          passos: plan.passos.length,
        };
      },
    }),
  };
}

/**
 * Tools de exploração SQL (snapshot DuckDB + conexão do relatório).
 * Usadas na execução do plano (fila), não na fase de planejamento.
 */
export function buildExplorationToolSet(params: {
  explorationTools: AiExplorationToolsService;
  userId: number;
  emitChart?: (spec: AiChartSpec) => void;
  emitTable?: (spec: AiTableSpec) => void;
}) {
  const { explorationTools, userId, emitChart, emitTable } = params;

  return {
    garantirSnapshot: tool({
      description:
        'Garante que o relatório tem snapshot Parquet válido para análise. Se estiver ausente ou inválido, enfileira a geração e retorna status gerando. Chame antes de executarQuerySnapshot quando necessário.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
      }),
      execute: async ({ relatorioId }) =>
        explorationTools.garantirSnapshot(userId, relatorioId),
    }),
    executarQuerySnapshot: tool({
      description:
        'Executa SQL SELECT read-only no snapshot Parquet do relatório via DuckDB. A tabela lógica chama-se "dados" (não use read_parquet nem caminhos de arquivo). Use para agregações, filtros e exploração livre. Se falhar por coluna/SQL, corrija e tente de novo.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        sql: z
          .string()
          .min(10)
          .describe(
            'SELECT/WITH usando a tabela "dados". Ex.: SELECT col, count(*) FROM dados GROUP BY 1',
          ),
      }),
      execute: async ({ relatorioId, sql }) =>
        explorationTools.executarQuerySnapshot(userId, relatorioId, sql),
    }),
    executarQueryConexao: tool({
      description:
        'Executa SQL SELECT read-only na conexão de banco do relatório autorizado (preview limitado). Use quando precisar validar dados ao vivo ou o snapshot não bastar. Não invente tabelas — use nomes reais do schema quando souber.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        sql: z.string().min(10).describe('Somente SELECT/WITH, um statement.'),
      }),
      execute: async ({ relatorioId, sql }) =>
        explorationTools.executarQueryConexao(userId, relatorioId, sql),
    }),
    visualizarDados: tool({
      description:
        'Executa SQL no snapshot e gera um gráfico interativo no chat (data-chart). Use para visualizar agregações (NPS por mês, tendências, comparações). Retorna apenas resumo — os pontos do gráfico não entram no contexto. Prefira esta tool em vez de tabelas markdown quando o plano pedir visualização.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        sql: z
          .string()
          .min(10)
          .describe('SELECT/WITH na tabela "dados".'),
        titulo: z.string().min(3).max(160),
        subtitle: z.string().max(240).optional(),
        tipoGrafico: z
          .enum(['line', 'bar', 'area', 'scatter', 'auto'])
          .optional()
          .describe('Padrão: auto (infere pelo tipo das colunas).'),
        colunaX: z.string().min(1).max(60).optional(),
        series: z.array(z.string().min(1).max(60)).max(6).optional(),
      }),
      execute: async (input) => {
        const result = await explorationTools.visualizarDados(userId, input);
        if (result.chartSpec && emitChart) {
          emitChart(result.chartSpec);
        }
        return result.resumo;
      },
    }),
    publicarTabela: tool({
      description:
        'Executa SQL no snapshot e publica uma tabela interativa no chat (data-table). Use para dados tabulares detalhados. PROIBIDO reproduzir os mesmos dados em markdown — use esta tool.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        sql: z
          .string()
          .min(10)
          .describe('SELECT/WITH na tabela "dados".'),
        titulo: z.string().min(3).max(160),
        subtitle: z.string().max(240).optional(),
      }),
      execute: async (input) => {
        const result = await explorationTools.publicarTabela(userId, input);
        if (result.tableSpec && emitTable) {
          emitTable(result.tableSpec);
        }
        return result.resumo;
      },
    }),
  };
}

/**
 * Tools do modo analítico. O cálculo roda em SQL/DuckDB e o gráfico sai por
 * `emitChart`, não pelo retorno — assim os pontos do gráfico não entram no
 * contexto do modelo e ele não pode reescrever os números.
 */
export function buildAnalyticsToolSet(params: {
  analyticsTools: AiAnalyticsToolsService;
  userId: number;
  emitChart: (spec: AiChartSpec) => void;
}) {
  const { analyticsTools, userId, emitChart } = params;

  const granularidade = z
    .enum(ANALYTICS_GRANULARITIES)
    .optional()
    .describe('Granularidade temporal dos períodos. Padrão: mes.');
  const agregacao = z
    .enum(ANALYTICS_AGGREGATIONS)
    .optional()
    .describe('Como agregar o valor dentro de cada período. Padrão: soma.');

  const run = async (
    operation: Promise<{
      resumo: Record<string, unknown>;
      chartSpec: AiChartSpec | null;
    }>,
  ) => {
    const { resumo, chartSpec } = await operation;

    if (chartSpec) {
      emitChart(chartSpec);
    }

    return resumo;
  };

  return {
    analisarTendencia: tool({
      description:
        'Analisa a tendência de uma coluna numérica ao longo do tempo em um relatório autorizado (regressão linear em SQL). Retorna inclinação, R², variação percentual e gera um gráfico de linha automaticamente. Use quando a pergunta envolver evolução, crescimento, queda ou histórico.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        colunaData: z
          .string()
          .min(1)
          .describe('Coluna de data/hora usada para montar os períodos.'),
        colunaValor: z
          .string()
          .min(1)
          .describe('Coluna numérica cuja tendência será medida.'),
        granularidade,
        agregacao,
      }),
      execute: async (input) =>
        run(analyticsTools.analisarTendencia(userId, input)),
    }),
    calcularCorrelacao: tool({
      description:
        'Calcula a correlação de Pearson entre colunas numéricas de um relatório autorizado e gera um gráfico de dispersão do par mais forte. Use quando a pergunta envolver relação, influência ou associação entre métricas.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        colunas: z
          .array(z.string().min(1))
          .min(2)
          .max(6)
          .describe('Colunas numéricas a correlacionar (mínimo 2).'),
      }),
      execute: async (input) =>
        run(analyticsTools.calcularCorrelacao(userId, input)),
    }),
    detectarOutliers: tool({
      description:
        'Detecta valores atípicos em uma coluna numérica de um relatório autorizado, por z-score ou IQR, e gera um gráfico dos maiores desvios. Use quando a pergunta envolver anomalias, valores fora do padrão ou picos.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        coluna: z.string().min(1).describe('Coluna numérica a inspecionar.'),
        metodo: z
          .enum(OUTLIER_METHODS)
          .optional()
          .describe('zscore (padrão, limite 3) ou iqr (limite 1.5).'),
        limite: z
          .number()
          .positive()
          .max(10)
          .optional()
          .describe(
            'Limite do método: desvios-padrão no zscore, multiplicador no iqr.',
          ),
      }),
      execute: async (input) =>
        run(analyticsTools.detectarOutliers(userId, input)),
    }),
    resumirDistribuicao: tool({
      description:
        'Resume a distribuição de uma coluna numérica de um relatório autorizado (média, mediana, desvio padrão, percentis) e gera um histograma. Use quando a pergunta envolver perfil, faixa típica, concentração ou dispersão dos valores.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        coluna: z.string().min(1).describe('Coluna numérica a resumir.'),
        faixas: z
          .number()
          .int()
          .min(4)
          .max(30)
          .optional()
          .describe('Número de faixas do histograma. Padrão: 10.'),
      }),
      execute: async (input) =>
        run(analyticsTools.resumirDistribuicao(userId, input)),
    }),
    compararPeriodos: tool({
      description:
        'Compara uma métrica período a período (mês a mês, ano a ano) em um relatório autorizado, com variação percentual, e gera um gráfico de barras. Use quando a pergunta envolver comparação entre períodos, sazonalidade ou variação recente.',
      inputSchema: z.object({
        relatorioId: z.number().int().positive(),
        colunaData: z
          .string()
          .min(1)
          .describe('Coluna de data/hora usada para montar os períodos.'),
        colunaValor: z
          .string()
          .min(1)
          .describe('Coluna numérica comparada entre períodos.'),
        granularidade,
        agregacao,
        periodos: z
          .number()
          .int()
          .min(2)
          .max(60)
          .optional()
          .describe('Quantidade de períodos mais recentes. Padrão: 12.'),
      }),
      execute: async (input) =>
        run(analyticsTools.compararPeriodos(userId, input)),
    }),
  };
}

/**
 * Tools analíticas do domínio Usuários (não dependem de relatório).
 * Gráficos seguem o mesmo fluxo `emitChart` das tools de relatório.
 */
export function buildUserDomainAnalyticsToolSet(params: {
  adminTools: AiAdminToolsService;
  userId: number;
  emitChart: (spec: AiChartSpec) => void;
}) {
  const { adminTools, userId, emitChart } = params;

  const run = async (
    operation: Promise<{
      resumo: Record<string, unknown>;
      chartSpec: AiChartSpec | null;
    }>,
  ) => {
    const { resumo, chartSpec } = await operation;

    if (chartSpec) {
      emitChart(chartSpec);
    }

    return resumo;
  };

  return {
    graficoUsuariosPorRegra: tool({
      description:
        'Gera um gráfico de barras com a distribuição de usuários por tipo de regra (ex.: REGRA_ADMIN, REGRA_DASHBOARD, REGRA_USUARIO). Use quando a pergunta envolver usuários agrupados por regra, perfil de acesso ou composição da base de usuários. O gráfico é renderizado automaticamente na conversa — não descreva o gráfico em texto nem tabelas substitutas.',
      inputSchema: z.object({
        somenteAtivos: z
          .boolean()
          .optional()
          .describe(
            'Se true (padrão), considera apenas usuários não bloqueados.',
          ),
      }),
      execute: async (input) =>
        run(adminTools.analisarUsuariosPorRegra(userId, input)),
    }),
  };
}
