import { z } from 'zod';
import { createPaginationSchema } from 'src/shared/dto/pagination.dto';

export const connectionQuerySchema = createPaginationSchema().extend({
  nome: z.string().trim().optional(),
  tipo: z.string().trim().optional(),
});

export type ConnectionQueryDto = z.infer<typeof connectionQuerySchema>;
