import { z } from 'zod';
import { TipoConexao } from 'src/database/entities/Conexoes';

export const updateConnectionSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    tipo: z.nativeEnum(TipoConexao).optional(),
    host: z.string().trim().min(1).optional(),
    porta: z.coerce.number().int().positive().optional(),
    database: z.string().trim().min(1).optional(),
    usuario: z.string().trim().min(1).optional(),
    senha: z.string().optional(),
    opcoes: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type UpdateConnectionDto = z.infer<typeof updateConnectionSchema>;
