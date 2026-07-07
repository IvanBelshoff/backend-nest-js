import { z } from 'zod';
import { createPaginationSchema } from 'src/shared/dto/pagination.dto';

export const dashboardQuerySchema = createPaginationSchema(4, 200).extend({
  nome: z.string().trim().optional(),
  id_criador: z.string().trim().optional(),
  visivel: z.string().trim().optional(),
  privacidade: z.string().trim().optional(),
  temporario: z.string().trim().optional(),
  expiracao: z.string().trim().optional(),
  favoritos: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;

export const dashboardPrivateQuerySchema = createPaginationSchema(4, 200).extend({
  nome: z.string().trim().optional(),
  favoritos: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  privacidade: z.enum(['privado', 'publico']).optional(),
  temporario: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type DashboardPrivateQueryDto = z.infer<
  typeof dashboardPrivateQuerySchema
>;

export const dashboardPublicQuerySchema = createPaginationSchema(4, 200).extend({
  nome: z.string().trim().optional(),
});

export type DashboardPublicQueryDto = z.infer<
  typeof dashboardPublicQuerySchema
>;
