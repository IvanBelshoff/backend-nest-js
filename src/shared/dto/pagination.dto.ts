import type { Response } from 'express';
import { z } from 'zod';

export function createPaginationSchema(defaultLimit = 10, maxLimit = 200) {
  return z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(maxLimit).default(defaultLimit),
    filter: z.string().trim().optional().default(''),
  });
}

export type PaginationQuery = z.infer<ReturnType<typeof createPaginationSchema>>;

export function parsePagination(
  query: unknown,
  options?: { defaultLimit?: number; maxLimit?: number },
): PaginationQuery {
  const schema = createPaginationSchema(
    options?.defaultLimit,
    options?.maxLimit,
  );

  return schema.parse(query ?? {});
}

export function setTotalCount(response: Response, total: number): void {
  response.setHeader('access-control-expose-headers', 'x-total-count');
  response.setHeader('x-total-count', String(total));
}
