import { z } from 'zod';

export const updateUserReportAiKnowledgeSchema = z
  .object({
    relatorioId: z.coerce.number().int().positive(),
    permitirConhecimentoIa: z.boolean(),
  })
  .strict();

export type UpdateUserReportAiKnowledgeDto = z.infer<
  typeof updateUserReportAiKnowledgeSchema
>;
