import { z } from 'zod';

/**
 * Contrato fechado dos gráficos exibidos na conversa.
 *
 * Os números saem sempre do backend (tools analíticas) e são enviados ao
 * frontend como data part `data-chart`; o modelo nunca reescreve esses valores.
 */
export const aiChartTypeSchema = z.enum(['line', 'bar', 'area', 'scatter']);

export type AiChartType = z.infer<typeof aiChartTypeSchema>;

export const aiChartAxisTypeSchema = z.enum(['category', 'number', 'time']);

export const aiChartSeriesSchema = z
  .object({
    key: z.string().min(1).max(60),
    label: z.string().min(1).max(80),
  })
  .strict();

const chartValueSchema = z.union([z.string(), z.number(), z.null()]);

export const aiChartSpecSchema = z
  .object({
    type: aiChartTypeSchema,
    title: z.string().min(1).max(160),
    subtitle: z.string().max(240).optional(),
    xAxis: z
      .object({
        key: z.string().min(1).max(60),
        label: z.string().min(1).max(80),
        type: aiChartAxisTypeSchema.default('category'),
      })
      .strict(),
    yAxis: z
      .object({
        label: z.string().max(80).optional(),
        unit: z.string().max(20).optional(),
      })
      .strict()
      .optional(),
    series: z.array(aiChartSeriesSchema).min(1).max(6),
    data: z.array(z.record(z.string(), chartValueSchema)).min(1).max(500),
    source: z.string().max(240).optional(),
    footnote: z.string().max(240).optional(),
  })
  .strict();

export type AiChartSpec = z.infer<typeof aiChartSpecSchema>;

/**
 * Valida o spec montado pelas tools. Um gráfico inválido nunca deve derrubar a
 * análise: o texto continua útil sem ele, então o erro é degradado para null.
 */
export function parseChartSpec(candidate: unknown): AiChartSpec | null {
  const result = aiChartSpecSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
