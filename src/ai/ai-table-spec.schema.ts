import { z } from 'zod';

export const aiTableColumnSchema = z
  .object({
    key: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    align: z.enum(['left', 'right']).optional(),
  })
  .strict();

export const aiTableSpecSchema = z
  .object({
    title: z.string().min(1).max(160),
    subtitle: z.string().max(240).optional(),
    columns: z.array(aiTableColumnSchema).min(1).max(20),
    rows: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
      .min(1)
      .max(500),
    source: z.string().max(240).optional(),
    footnote: z.string().max(240).optional(),
    truncado: z.boolean().optional(),
  })
  .strict();

export type AiTableSpec = z.infer<typeof aiTableSpecSchema>;

export function parseTableSpec(candidate: unknown): AiTableSpec | null {
  const result = aiTableSpecSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function buildTableSpecFromRows(params: {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  source?: string;
  subtitle?: string;
  truncado?: boolean;
}): AiTableSpec | null {
  const { columns, rows, title, source, subtitle, truncado } = params;

  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  const tableColumns = columns.map((column) => {
    const isNumeric = rows.some((row) => {
      const value = row[column];
      if (typeof value === 'number') {
        return Number.isFinite(value);
      }
      if (typeof value === 'string') {
        return Number.isFinite(Number(value.trim()));
      }
      return false;
    });

    return {
      key: column,
      label: column,
      ...(isNumeric ? { align: 'right' as const } : {}),
    };
  });

  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string | number | null> = {};
    for (const column of columns) {
      const value = row[column];
      if (value === null || value === undefined) {
        normalized[column] = null;
      } else if (typeof value === 'number' || typeof value === 'bigint') {
        normalized[column] = Number(value);
      } else {
        normalized[column] = String(value);
      }
    }
    return normalized;
  });

  return parseTableSpec({
    title,
    subtitle,
    columns: tableColumns,
    rows: normalizedRows,
    source,
    truncado,
    footnote: truncado ? 'Resultado truncado ao limite de linhas da consulta.' : undefined,
  });
}
