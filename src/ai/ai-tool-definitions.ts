import { tool } from 'ai';
import { z } from 'zod';
import type { AiAnalyticsToolsService } from './ai-analytics-tools.service';
import type { AiAdminToolsService } from './ai-admin-tools.service';
import {
  ANALYTICS_AGGREGATIONS,
  ANALYTICS_GRANULARITIES,
  OUTLIER_METHODS,
} from './ai-analytics.types';
import type { AiChartSpec } from './ai-chart-spec.schema';
import type { AiReportToolsService } from './ai-report-tools.service';

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
