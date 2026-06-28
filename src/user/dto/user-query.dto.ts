import { z } from 'zod';
import { createPaginationSchema } from 'src/shared/dto/pagination.dto';

export const userQuerySchema = createPaginationSchema(7, 200);

export type UserQueryDto = z.infer<typeof userQuerySchema>;
