function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const raw =
    typeof value === 'object' ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, '""');

  if (/[",\n\r;]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

export function buildCsvContent(
  colunas: string[],
  dados: Record<string, unknown>[],
): string {
  const header = colunas.map(escapeCsvValue).join(',');
  const rows = dados.map((row) =>
    colunas.map((coluna) => escapeCsvValue(row[coluna])).join(','),
  );

  return `\uFEFF${[header, ...rows].join('\n')}`;
}
