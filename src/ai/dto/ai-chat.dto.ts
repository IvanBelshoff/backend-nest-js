import { z } from 'zod';

export const aiMentionTypeSchema = z.enum([
  'relatorio',
  'dashboard',
  'usuario',
  'dominio_relatorios',
  'dominio_dashboards',
  'dominio_usuarios',
]);

export const aiMentionSchema = z
  .object({
    type: aiMentionTypeSchema,
    id: z.coerce.number().int().positive().optional(),
    label: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsId =
      value.type === 'relatorio' ||
      value.type === 'dashboard' ||
      value.type === 'usuario';

    if (needsId && value.id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Mention do tipo ${value.type} exige id.`,
        path: ['id'],
      });
    }

    if (!needsId && value.id != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Mention do tipo ${value.type} não deve ter id.`,
        path: ['id'],
      });
    }
  });

export type AiMentionDto = z.infer<typeof aiMentionSchema>;

export const aiChatSchema = z
  .object({
    messages: z.array(z.record(z.string(), z.unknown())),
    threadId: z.string().uuid().optional(),
    mentions: z.array(aiMentionSchema).max(20).optional(),
  })
  .strict();

export type AiChatDto = z.infer<typeof aiChatSchema>;

export const createAiThreadSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type CreateAiThreadDto = z.infer<typeof createAiThreadSchema>;
