import { z } from 'zod';

const relatorioGrantSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export const assignRelatoriosSchema = z
  .object({
    relatorios: z.array(relatorioGrantSchema),
  })
  .strict();

export type AssignRelatoriosDto = z.infer<typeof assignRelatoriosSchema>;
