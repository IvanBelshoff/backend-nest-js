import { z } from 'zod';
import { createPaginationSchema } from 'src/shared/dto/pagination.dto';

export const userQuerySchema = createPaginationSchema(7, 200).extend({
  bloqueado: z
    .enum(['true', 'false'])
    .optional()
    .transform((value): boolean | undefined =>
      value === undefined ? undefined : value === 'true',
    ),
  regra: z.string().trim().optional(),
  permissao: z.string().trim().optional(),
});

export type UserQueryDto = z.infer<typeof userQuerySchema>;
