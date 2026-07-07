import { z } from 'zod';

export const assignRelatoriosSchema = z
  .object({
    relatorios: z.array(z.coerce.number().int().positive()),
  })
  .strict();

export type AssignRelatoriosDto = z.infer<typeof assignRelatoriosSchema>;
