import { z } from 'zod';

export const aiChatSchema = z
  .object({
    messages: z.array(z.record(z.string(), z.unknown())),
    threadId: z.string().uuid().optional(),
  })
  .strict();

export type AiChatDto = z.infer<typeof aiChatSchema>;

export const createAiThreadSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type CreateAiThreadDto = z.infer<typeof createAiThreadSchema>;
