import { z } from 'zod';
import { Privacidade } from 'src/database/entities/Dashboards';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

const parametroSchema = z.object({
  nome: z.string().trim().min(1),
  tipo: z.enum(['string', 'number', 'date', 'boolean', 'enum']),
  obrigatorio: z.boolean().optional(),
  padrao: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  label: z.string().optional(),
  valores: z.array(z.string()).optional(),
});

export const createReportSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(200, 'Nome deve possuir no máximo 200 caracteres'),
    icone: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1, 'Query é obrigatória'),
    id_conexao: z.coerce.number().int().positive(),
    parametros: z.array(parametroSchema).optional(),
    temporario: booleanish.optional().default(false),
    data_expiracao_inicial: z.coerce.date().nullable().optional(),
    data_expiracao_final: z.coerce.date().nullable().optional(),
    privacidade: z.nativeEnum(Privacidade).optional(),
    visivel: booleanish.optional().default(false),
    limite_linhas: z.coerce.number().int().positive().optional(),
    timeout_ms: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type CreateReportDto = z.infer<typeof createReportSchema>;

export const updateReportSchema = z
  .object({
    nome: z.string().trim().min(1).max(200).optional(),
    icone: z.string().trim().min(1).optional(),
    query: z.string().trim().min(1).optional(),
    id_conexao: z.coerce.number().int().positive().optional(),
    parametros: z.array(parametroSchema).nullable().optional(),
    estado: z.nativeEnum(EstadoRelatorio).optional(),
    parametros_snapshot: z.record(z.string(), z.unknown()).optional(),
    temporario: booleanish.optional(),
    data_expiracao_inicial: z.coerce.date().nullable().optional(),
    data_expiracao_final: z.coerce.date().nullable().optional(),
    privacidade: z.nativeEnum(Privacidade).optional(),
    visivel: booleanish.optional(),
    limite_linhas: z.coerce.number().int().positive().optional(),
    timeout_ms: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type UpdateReportDto = z.infer<typeof updateReportSchema>;

export const executeReportSchema = z
  .object({
    parametros: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

export type ExecuteReportDto = z.infer<typeof executeReportSchema>;

export const snapshotUpdateSchema = z
  .object({
    parametros_snapshot: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type SnapshotUpdateDto = z.infer<typeof snapshotUpdateSchema>;
