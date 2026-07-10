import { z } from 'zod';

export const metricsHistoryQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export type MetricsHistoryQueryDto = z.infer<typeof metricsHistoryQuerySchema>;
