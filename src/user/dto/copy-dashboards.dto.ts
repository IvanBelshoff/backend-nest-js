import { z } from 'zod';

export const copyDashboardsSchema = z
  .object({
    id_usuario: z.coerce.number().int().positive(),
    id_copiado: z.coerce.number().int().positive(),
  })
  .strict();

export type CopyDashboardsDto = z.infer<typeof copyDashboardsSchema>;
