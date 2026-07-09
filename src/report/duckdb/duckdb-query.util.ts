export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  coluna: string;
  direcao: SortDirection;
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface FilterSpec {
  coluna: string;
  operador: FilterOperator;
  valor: string | number | boolean | null;
}

const SQL_OPERATOR: Record<Exclude<FilterOperator, 'contains'>, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** Cita um identificador de coluna com aspas duplas, validando contra a whitelist de colunas conhecidas. */
export function quoteIdentifier(name: string, allowedColumns: string[]): string {
  if (!allowedColumns.includes(name)) {
    throw new Error(`Coluna desconhecida: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Converte um caminho de arquivo em literal SQL seguro (barras normais + escape de aspas simples). */
export function sqlPathLiteral(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return `'${normalized.replace(/'/g, "''")}'`;
}

/** Monta a cláusula ORDER BY a partir de um sort string "coluna:asc,outra:desc". */
export function buildOrderByClause(
  sort: SortSpec[] | undefined,
  allowedColumns: string[],
): string {
  if (!sort || sort.length === 0) {
    return '';
  }

  const parts = sort.map((spec) => {
    const identifier = quoteIdentifier(spec.coluna, allowedColumns);
    const direction = spec.direcao === 'desc' ? 'DESC' : 'ASC';
    return `${identifier} ${direction}`;
  });

  return `ORDER BY ${parts.join(', ')}`;
}

/** Faz o parse de filtros JSON `[{ coluna, operador, valor }]`. */
export function parseFiltersParam(
  filtros: string | undefined,
): FilterSpec[] {
  if (!filtros) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(filtros);
  } catch {
    throw new Error('Parâmetro filtros deve ser um JSON válido');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Parâmetro filtros deve ser um array');
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Filtro inválido no índice ${index}`);
    }

    const { coluna, operador, valor } = item as Record<string, unknown>;

    if (typeof coluna !== 'string' || coluna.length === 0) {
      throw new Error(`Filtro ${index}: coluna é obrigatória`);
    }

    if (typeof operador !== 'string') {
      throw new Error(`Filtro ${index}: operador é obrigatório`);
    }

    const allowed: FilterOperator[] = [
      'eq',
      'ne',
      'contains',
      'gt',
      'gte',
      'lt',
      'lte',
    ];
    if (!allowed.includes(operador as FilterOperator)) {
      throw new Error(`Filtro ${index}: operador inválido (${operador})`);
    }

    return {
      coluna,
      operador: operador as FilterOperator,
      valor:
        valor === undefined
          ? null
          : (valor as string | number | boolean | null),
    };
  });
}

/** Faz o parse de um parâmetro de query "coluna:asc,outra:desc" para SortSpec[]. */
export function parseSortParam(sort: string | undefined): SortSpec[] {
  if (!sort) {
    return [];
  }

  return sort
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [coluna, direcaoRaw] = token.split(':');
      const direcao: SortDirection =
        (direcaoRaw ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      return { coluna: coluna.trim(), direcao };
    });
}

export interface WhereClause {
  clause: string;
  params: (string | number | boolean | null)[];
}

/**
 * Monta a cláusula WHERE com parâmetros posicionais ($1, $2, ...).
 * Identificadores são validados contra a whitelist; valores são sempre parametrizados.
 */
export function buildWhereClause(
  filters: FilterSpec[] | undefined,
  allowedColumns: string[],
): WhereClause {
  if (!filters || filters.length === 0) {
    return { clause: '', params: [] };
  }

  const params: (string | number | boolean | null)[] = [];
  const conditions = filters.map((filter) => {
    const identifier = quoteIdentifier(filter.coluna, allowedColumns);

    if (filter.operador === 'contains') {
      params.push(`%${String(filter.valor ?? '')}%`);
      return `CAST(${identifier} AS VARCHAR) ILIKE $${params.length}`;
    }

    const operator = SQL_OPERATOR[filter.operador];
    if (!operator) {
      throw new Error(`Operador de filtro inválido: ${filter.operador}`);
    }

    params.push(filter.valor);
    return `${identifier} ${operator} $${params.length}`;
  });

  return { clause: `WHERE ${conditions.join(' AND ')}`, params };
}

/** Converte valores DuckDB (ex.: BigInt de colunas BIGINT) em valores JSON-serializáveis. */
export function normalizeDuckValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDuckValue);
  }

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = normalizeDuckValue(val);
    }
    return out;
  }

  return value;
}

export function normalizeRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeDuckValue(row) as Record<string, unknown>;
}
