import {
  parseChartSpec,
  type AiChartSpec,
  type AiChartType,
} from '../ai-chart-spec.schema';

export type ChartFromRowsInput = {
  columns: string[];
  rows: Record<string, unknown>[];
  title: string;
  source?: string;
  subtitle?: string;
  tipoGrafico?: AiChartType | 'auto';
  colunaX?: string;
  series?: string[];
};

function isNumericValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'bigint') {
    return true;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return Number.isFinite(Number(trimmed));
  }
  return false;
}

function toChartValue(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  return String(value);
}

function looksTemporalColumn(name: string, values: unknown[]): boolean {
  if (/data|date|periodo|per[ií]odo|mes|m[eê]s|ano|time|timestamp/i.test(name)) {
    return true;
  }

  const sample = values.slice(0, 5);
  return sample.every((value) => {
    if (value instanceof Date) {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const parsed = Date.parse(value);
    return !Number.isNaN(parsed);
  });
}

function inferChartType(
  xKey: string,
  xValues: unknown[],
  numericKeys: string[],
  explicit?: ChartFromRowsInput['tipoGrafico'],
): AiChartType {
  if (explicit && explicit !== 'auto') {
    return explicit;
  }

  if (numericKeys.length >= 2 && !xKey) {
    return 'scatter';
  }

  if (looksTemporalColumn(xKey, xValues)) {
    return 'line';
  }

  return 'bar';
}

/**
 * Monta um AiChartSpec a partir de linhas SQL. Auto-detecta eixo X e séries
 * quando não informados.
 */
export function buildChartSpecFromRows(
  input: ChartFromRowsInput,
): AiChartSpec | null {
  const { columns, rows, title, source, subtitle, tipoGrafico, colunaX, series } =
    input;

  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  const numericColumns = columns.filter((column) =>
    rows.some((row) => isNumericValue(row[column])),
  );

  if (numericColumns.length === 0) {
    return null;
  }

  let xKey = colunaX?.trim();
  if (xKey && !columns.includes(xKey)) {
    xKey = undefined;
  }

  if (!xKey) {
    const nonNumeric = columns.filter((column) => !numericColumns.includes(column));
    xKey = nonNumeric[0] ?? columns[0];
  }

  let seriesKeys = series?.filter((key) => columns.includes(key)) ?? [];
  if (seriesKeys.length === 0) {
    seriesKeys = numericColumns.filter((column) => column !== xKey);
  }

  if (seriesKeys.length === 0 && numericColumns.length === 2) {
    const other = numericColumns.find((column) => column !== xKey);
    if (other) {
      seriesKeys = [other];
    }
  }

  if (seriesKeys.length === 0) {
    const fallback = numericColumns.find((column) => column !== xKey);
    if (!fallback) {
      return null;
    }
    seriesKeys = [fallback];
  }

  const xValues = rows.map((row) => row[xKey]);
  const chartType = inferChartType(xKey, xValues, seriesKeys, tipoGrafico);

  const data = rows.map((row) => {
    const point: Record<string, string | number | null> = {
      [xKey]: toChartValue(row[xKey]),
    };

    for (const key of seriesKeys) {
      point[key] = toChartValue(row[key]);
    }

    if (chartType === 'scatter' && seriesKeys.length === 1) {
      point.x = toChartValue(row[xKey]);
      point.y = toChartValue(row[seriesKeys[0]]);
    }

    return point;
  });

  const xAxisType = looksTemporalColumn(xKey, xValues) ? 'time' : 'category';

  const candidate =
    chartType === 'scatter' && seriesKeys.length === 1
      ? {
          type: 'scatter' as const,
          title,
          subtitle,
          xAxis: { key: 'x', label: xKey, type: 'number' as const },
          yAxis: { label: seriesKeys[0] },
          series: [{ key: 'y', label: seriesKeys[0] }],
          data,
          source,
        }
      : {
          type: chartType,
          title,
          subtitle,
          xAxis: { key: xKey, label: xKey, type: xAxisType },
          yAxis: { label: seriesKeys.length === 1 ? seriesKeys[0] : undefined },
          series: seriesKeys.map((key) => ({ key, label: key })),
          data,
          source,
        };

  return parseChartSpec(candidate);
}
