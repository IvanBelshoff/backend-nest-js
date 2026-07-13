import { z } from 'zod';
import { AgendamentoFrequencia } from '../entities/scheduler.enums';

const smallintArray = z
  .array(z.coerce.number().int())
  .optional()
  .default([]);

const scheduleFieldsSchema = z
  .object({
    nome: z.string().trim().min(1).max(200),
    ativo: z.boolean().optional().default(true),
    intervalo: z.coerce.number().int().positive().optional().default(1),
    frequencia: z.nativeEnum(AgendamentoFrequencia),
    timezone: z.string().trim().min(1).optional().default('America/Sao_Paulo'),
    hora_inicio: z.coerce.date().nullable().optional(),
    dias_semana: smallintArray,
    horas: smallintArray,
    minutos: smallintArray,
  })
  .strict();

export const createAgendamentoSchema = scheduleFieldsSchema;

export type CreateAgendamentoDto = z.infer<typeof createAgendamentoSchema>;

export const updateAgendamentoSchema = scheduleFieldsSchema.partial().strict();

export type UpdateAgendamentoDto = z.infer<typeof updateAgendamentoSchema>;
