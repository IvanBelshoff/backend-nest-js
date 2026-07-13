import { z } from 'zod';
import {
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';

export const listAdminJobsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(50),
    status: z.nativeEnum(RelatorioJobStatus).optional(),
    tipo: z.nativeEnum(RelatorioJobTipo).optional(),
    relatorio_id: z.coerce.number().int().positive().optional(),
    user_id: z.coerce.number().int().positive().optional(),
    job_id: z.string().uuid().optional(),
    created_from: z.coerce.date().optional(),
    created_to: z.coerce.date().optional(),
    sort: z.enum(['created_at:asc', 'created_at:desc']).default('created_at:desc'),
  })
  .strict();

export type ListAdminJobsQueryDto = z.infer<typeof listAdminJobsQuerySchema>;
