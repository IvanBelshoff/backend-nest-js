import { z } from 'zod';

export const exportReportSchema = z.object({
  parametros: z.record(z.string(), z.unknown()).optional().default({}),
  formato: z.literal('csv').default('csv'),
});

export type ExportReportDto = z.infer<typeof exportReportSchema>;
