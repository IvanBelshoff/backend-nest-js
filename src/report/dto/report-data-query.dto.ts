import { z } from 'zod';

export const reportDataQuerySchema = z.object({
  parametros: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(1000).default(50),
  sort: z.string().trim().optional(),
  filtros: z.string().optional(),
});

export type ReportDataQueryDto = z.infer<typeof reportDataQuerySchema>;
