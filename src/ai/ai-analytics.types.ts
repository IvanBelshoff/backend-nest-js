import type { AiChartSpec } from './ai-chart-spec.schema';

export const ANALYTICS_GRANULARITIES = [
  'dia',
  'semana',
  'mes',
  'trimestre',
  'ano',
] as const;

export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

export const ANALYTICS_AGGREGATIONS = ['soma', 'media', 'contagem'] as const;

export type AnalyticsAggregation = (typeof ANALYTICS_AGGREGATIONS)[number];

export const OUTLIER_METHODS = ['zscore', 'iqr'] as const;

export type OutlierMethod = (typeof OUTLIER_METHODS)[number];

/**
 * Resultado de uma tool analítica.
 *
 * `resumo` é o único trecho entregue ao modelo — os pontos do gráfico ficam
 * fora do contexto do LLM para não inflar tokens nem permitir que ele reescreva
 * os números. `chartSpec` segue para o stream como data part.
 */
export type AiAnalyticsResult = {
  resumo: Record<string, unknown>;
  chartSpec: AiChartSpec | null;
};
