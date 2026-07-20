import { z } from 'zod';

export const userNotificationPayloadSchema = z.object({
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

export type UserNotificationPayloadDto = z.infer<
  typeof userNotificationPayloadSchema
>;
