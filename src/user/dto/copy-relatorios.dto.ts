import { z } from 'zod';

export const copyRelatoriosSchema = z
  .object({
    id_usuario: z.coerce.number().int().positive(),
    id_copiado: z.coerce.number().int().positive(),
  })
  .strict();

export type CopyRelatoriosDto = z.infer<typeof copyRelatoriosSchema>;
