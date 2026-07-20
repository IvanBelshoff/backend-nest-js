import { z } from 'zod';

export const updateReportUserAiKnowledgeSchema = z
  .object({
    usuarioId: z.coerce.number().int().positive(),
    permitirConhecimentoIa: z.boolean(),
  })
  .strict();

export type UpdateReportUserAiKnowledgeDto = z.infer<
  typeof updateReportUserAiKnowledgeSchema
>;
