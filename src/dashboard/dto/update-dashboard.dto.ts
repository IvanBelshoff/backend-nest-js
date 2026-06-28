import { z } from 'zod';
import { Privacidade } from 'src/database/entities/Dashboards';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

export const updateDashboardSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    url: z.string().trim().min(1).optional(),
    icone: z.string().trim().min(1).optional(),
    query: z.string().nullable().optional(),
    temporario: booleanish.optional(),
    data_expiracao_inicial: z.coerce.date().nullable().optional(),
    data_expiracao_final: z.coerce.date().nullable().optional(),
    privacidade: z.nativeEnum(Privacidade).optional(),
    visivel: booleanish.optional(),
  })
  .strict();

export type UpdateDashboardDto = z.infer<typeof updateDashboardSchema>;
