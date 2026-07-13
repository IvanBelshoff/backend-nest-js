import { z } from 'zod';
import { AgendamentoExecucaoStatus } from 'src/scheduler/entities/scheduler.enums';

export const listAdminScheduleExecutionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(50),
    status: z.nativeEnum(AgendamentoExecucaoStatus).optional(),
    relatorio_id: z.coerce.number().int().positive().optional(),
    created_from: z.coerce.date().optional(),
    created_to: z.coerce.date().optional(),
    sort: z
      .enum(['iniciado_em:asc', 'iniciado_em:desc'])
      .default('iniciado_em:desc'),
  })
  .strict();

export type ListAdminScheduleExecutionsQueryDto = z.infer<
  typeof listAdminScheduleExecutionsQuerySchema
>;
