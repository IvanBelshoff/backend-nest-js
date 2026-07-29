import { z } from 'zod';

export const reportJobNotificationPayloadSchema = z.object({
  kind: z.literal('report_job'),
  jobId: z.string().uuid(),
  relatorioId: z.number().int().positive(),
  relatorioNome: z.string().min(1),
  jobTipo: z.enum(['export_csv', 'snapshot']),
  jobStatus: z.enum(['queued', 'processing', 'completed', 'failed']),
  downloadAvailable: z.boolean(),
  errorMessage: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  origem: z.enum(['manual', 'agendado']).nullable(),
  fileName: z.string().nullable(),
  parametrosResumo: z.string().nullable(),
});

/** Análise em fila do assistente: `threadId` permite voltar direto à conversa. */
export const aiAnalysisNotificationPayloadSchema = z.object({
  kind: z.literal('ai_analysis'),
  jobId: z.string().min(1),
  threadId: z.string().uuid(),
  status: z.enum(['completed', 'failed']),
  pergunta: z.string().min(1),
  errorMessage: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export const userNotificationPayloadSchema = z.discriminatedUnion('kind', [
  reportJobNotificationPayloadSchema,
  aiAnalysisNotificationPayloadSchema,
]);

export type ReportJobNotificationPayloadDto = z.infer<
  typeof reportJobNotificationPayloadSchema
>;

export type AiAnalysisNotificationPayloadDto = z.infer<
  typeof aiAnalysisNotificationPayloadSchema
>;

export type UserNotificationPayloadDto = z.infer<
  typeof userNotificationPayloadSchema
>;
