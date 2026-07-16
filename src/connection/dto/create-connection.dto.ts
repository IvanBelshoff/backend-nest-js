import { z } from 'zod';
import { TipoConexao } from 'src/database/entities/Conexoes';

export const createConnectionSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(200, 'Nome deve possuir no máximo 200 caracteres'),
    tipo: z.nativeEnum(TipoConexao),
    host: z.string().trim().min(1, 'Host é obrigatório'),
    porta: z.coerce.number().int().positive(),
    database: z.string().trim().min(1, 'Database é obrigatório'),
    usuario: z.string().trim().min(1, 'Usuário é obrigatório'),
    senha: z.string(),
    opcoes: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateConnectionDto = z.infer<typeof createConnectionSchema>;
