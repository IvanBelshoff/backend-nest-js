import { z } from 'zod';

const relatorioGrantSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    permitirConhecimentoIa: z.boolean().optional(),
  })
  .strict();

export const assignRelatoriosSchema = z
  .object({
    relatorios: z.array(relatorioGrantSchema),
  })
  .strict();

export type AssignRelatoriosDto = z.infer<typeof assignRelatoriosSchema>;
