import { z } from 'zod';
import { Privacidade } from 'src/database/entities/Dashboards';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

export const createDashboardSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(200, 'Nome deve possuir no máximo 200 caracteres'),

    url: z.string().trim().min(1, 'URL é obrigatória'),

    icone: z.string().trim().min(1).optional(),

    query: z.string().optional(),

    temporario: booleanish.optional().default(false),

    data_expiracao_inicial: z.coerce.date().nullable().optional(),

    data_expiracao_final: z.coerce.date().nullable().optional(),

    privacidade: z.nativeEnum(Privacidade).optional(),

    visivel: booleanish.optional().default(false),
  })
  .strict();

export type CreateDashboardDto = z.infer<typeof createDashboardSchema>;
