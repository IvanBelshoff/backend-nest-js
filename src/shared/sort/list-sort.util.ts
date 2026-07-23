export type ListSortDirection = 'asc' | 'desc';

export type ListSortSpec = {
  column: string;
  direction: ListSortDirection;
};

export function parseListSortParam(
  sort: string | undefined,
  allowedColumns: readonly string[],
): ListSortSpec[] {
  if (!sort) {
    return [];
  }

  const allowed = new Set(allowedColumns);

  return sort
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [column, directionRaw] = token.split(':');
      const columnName = column.trim();
      if (!allowed.has(columnName)) {
        throw new Error(`Coluna de ordenação inválida: ${columnName}`);
      }

      const direction: ListSortDirection =
        (directionRaw ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

      return { column: columnName, direction };
    });
}

export function buildMongoSort(
  specs: ListSortSpec[],
  fallback: Record<string, 1 | -1> = { criado_em: -1 },
): Record<string, 1 | -1> {
  if (specs.length === 0) {
    return fallback;
  }

  return Object.fromEntries(
    specs.map((spec) => [spec.column, spec.direction === 'desc' ? -1 : 1]),
  ) as Record<string, 1 | -1>;
}

export function buildTypeOrmOrder(
  specs: ListSortSpec[],
  alias: string,
  fallback: Record<string, 'ASC' | 'DESC'> = {},
): Record<string, 'ASC' | 'DESC'> {
  if (specs.length === 0) {
    return fallback;
  }

  const order: Record<string, 'ASC' | 'DESC'> = {};
  for (const spec of specs) {
    order[`${alias}.${spec.column}`] = spec.direction === 'desc' ? 'DESC' : 'ASC';
  }

  return order;
}
