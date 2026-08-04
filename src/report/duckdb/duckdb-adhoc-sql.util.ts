import { BadRequestException } from '@nestjs/common';
import { assertReadOnlyQuery } from 'src/report/execution/query-validator.util';

/** Funções / cláusulas que permitiriam escapar da view `dados` autorizada. */
const FORBIDDEN_ADHOC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bread_parquet\b/i, label: 'read_parquet' },
  { pattern: /\bread_csv\b/i, label: 'read_csv' },
  { pattern: /\bread_json\b/i, label: 'read_json' },
  { pattern: /\bread_json_auto\b/i, label: 'read_json_auto' },
  { pattern: /\bcopy\b/i, label: 'COPY' },
  { pattern: /\battach\b/i, label: 'ATTACH' },
  { pattern: /\binstall\b/i, label: 'INSTALL' },
  { pattern: /\bload\b/i, label: 'LOAD' },
  { pattern: /\bexport\b/i, label: 'EXPORT' },
  { pattern: /\bimport\b/i, label: 'IMPORT' },
  { pattern: /\bpragma\b/i, label: 'PRAGMA' },
  { pattern: /\bcall\b/i, label: 'CALL' },
];

/**
 * Valida SQL ad-hoc da IA e aplica teto de LIMIT.
 * A fonte Parquet é injetada pelo DuckDbService como view `dados` — o SQL do
 * modelo deve consultar apenas essa view.
 */
export function prepareAdhocSnapshotSql(
  sql: string,
  maxRows: number,
): string {
  assertReadOnlyQuery(sql);

  const trimmed = sql.replace(/\s+/g, ' ').trim();

  for (const { pattern, label } of FORBIDDEN_ADHOC_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new BadRequestException(
        `Query contém operação não permitida no snapshot: ${label}`,
      );
    }
  }

  // Bloqueia literais que parecem caminhos de arquivo / extensões de dados.
  if (
    /['"](?:[a-zA-Z]:[\\/]|[\\/]|\.{1,2}[\\/])[^'"]*['"]/.test(trimmed) ||
    /['"][^'"]*\.(?:parquet|csv|json|duckdb|db)['"]/i.test(trimmed)
  ) {
    throw new BadRequestException(
      'Query não pode referenciar caminhos de arquivo. Use a tabela lógica "dados".',
    );
  }

  return ensureLimit(trimmed, maxRows);
}

export function ensureLimit(sql: string, maxRows: number): string {
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)\b/i);

  if (limitMatch) {
    const requested = Number(limitMatch[1]);
    const capped = Math.min(requested, maxRows);
    return sql.replace(/\bLIMIT\s+\d+\b/i, `LIMIT ${capped}`);
  }

  return `SELECT * FROM (${sql}) AS _ai_limited LIMIT ${maxRows}`;
}
