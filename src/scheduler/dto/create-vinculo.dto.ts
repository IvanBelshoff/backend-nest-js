import { z } from 'zod';
import { AgendamentoVinculoTipo } from '../entities/scheduler.enums';

export const createVinculoSchema = z
  .object({
    tipo: z.nativeEnum(AgendamentoVinculoTipo),
    entidade_tipo: z.string().trim().min(1),
    entidade_id: z.coerce.number().int().positive(),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
    ativo: z.boolean().optional().default(true),
  })
  .strict();

export type CreateVinculoDto = z.infer<typeof createVinculoSchema>;

export const listVinculosQuerySchema = z
  .object({
    entidade_tipo: z.string().trim().min(1).optional(),
    entidade_id: z.coerce.number().int().positive().optional(),
    tipo: z.nativeEnum(AgendamentoVinculoTipo).optional(),
  })
  .strict();

export type ListVinculosQueryDto = z.infer<typeof listVinculosQuerySchema>;
