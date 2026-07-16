const SENSITIVE_COLUMN_PATTERN =
  /url|senha|password|connection|conexao|query|host|porta|token|secret|jdbc|connectionstring/i;

const URL_VALUE_PATTERN = /^https?:\/\//i;

export function isSensitiveColumnName(column: string): boolean {
  return SENSITIVE_COLUMN_PATTERN.test(column);
}

export function isSensitiveCellValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  return URL_VALUE_PATTERN.test(trimmed) || trimmed.toLowerCase().includes('jdbc:');
}

export function redactSensitiveReportRows(
  colunas: string[],
  dados: Record<string, unknown>[],
): { colunas: string[]; dados: Record<string, unknown>[] } {
  const sensitiveColumns = new Set(
    colunas.filter((column) => isSensitiveColumnName(column)),
  );

  const visibleColunas = colunas.filter((column) => !sensitiveColumns.has(column));

  const redactedDados = dados.map((row) => {
    const next: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      if (sensitiveColumns.has(key) || isSensitiveCellValue(value)) {
        continue;
      }

      next[key] = value;
    }

    return next;
  });

  return {
    colunas: visibleColunas,
    dados: redactedDados,
  };
}
