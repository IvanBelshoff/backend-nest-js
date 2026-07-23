import { z } from 'zod';
import { createPaginationSchema } from 'src/shared/dto/pagination.dto';

export const reportQuerySchema = createPaginationSchema(4, 200).extend({
  nome: z.string().trim().optional(),
  id_criador: z.string().trim().optional(),
  visivel: z.string().trim().optional(),
  privacidade: z.string().trim().optional(),
  temporario: z.string().trim().optional(),
  expiracao: z.string().trim().optional(),
  estado: z.string().trim().optional(),
});

export type ReportQueryDto = z.infer<typeof reportQuerySchema>;

export const reportPrivateQuerySchema = createPaginationSchema(4, 200).extend({
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
  sort: z
    .string()
    .trim()
    .regex(
      /^(nome|estado|privacidade):(asc|desc)$/,
      'Sort inválido. Use coluna:asc ou coluna:desc',
    )
    .optional(),
});

export type ReportPrivateQueryDto = z.infer<typeof reportPrivateQuerySchema>;

export const reportPublicQuerySchema = createPaginationSchema(4, 200).extend({
  nome: z.string().trim().optional(),
});

export type ReportPublicQueryDto = z.infer<typeof reportPublicQuerySchema>;
