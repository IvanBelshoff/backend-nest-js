import { z } from 'zod';
import { AgendamentoFrequencia } from '../entities/scheduler.enums';

export const createReportSnapshotScheduleSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    ativo: z.boolean().optional().default(true),
    intervalo: z.coerce.number().int().positive().optional().default(1),
    frequencia: z.nativeEnum(AgendamentoFrequencia),
    timezone: z.string().trim().min(1).optional().default('America/Sao_Paulo'),
    hora_inicio: z.coerce.date().nullable().optional(),
    dias_semana: z.array(z.coerce.number().int()).optional().default([]),
    horas: z.array(z.coerce.number().int()).optional().default([]),
    minutos: z.array(z.coerce.number().int()).optional().default([0]),
    parametros_snapshot: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

export type CreateReportSnapshotScheduleDto = z.infer<
  typeof createReportSnapshotScheduleSchema
>;
