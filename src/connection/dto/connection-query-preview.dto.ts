import { z } from 'zod';
import { env } from 'src/shared/env.schema';

const parametroSchema = z.object({
  nome: z.string().trim().min(1),
  tipo: z.enum(['string', 'number', 'date', 'boolean', 'enum']),
  obrigatorio: z.boolean().optional(),
  padrao: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  label: z.string().optional(),
  valores: z.array(z.string()).optional(),
});

export const connectionQueryPreviewSchema = z
  .object({
    query: z.string().trim().min(1, 'Query é obrigatória'),
    parametros: z.record(z.string(), z.unknown()).optional().default({}),
    parametros_schema: z.array(parametroSchema).optional(),
    limite: z.coerce
      .number()
      .int()
      .positive()
      .max(env.REPORT_QUERY_MAX_ROWS)
      .optional(),
  })
  .strict();

export type ConnectionQueryPreviewDto = z.infer<
  typeof connectionQueryPreviewSchema
>;

export const connectionQueryCountSchema = z
  .object({
    query: z.string().trim().min(1, 'Query é obrigatória'),
    parametros: z.record(z.string(), z.unknown()).optional().default({}),
    parametros_schema: z.array(parametroSchema).optional(),
  })
  .strict();

export type ConnectionQueryCountDto = z.infer<typeof connectionQueryCountSchema>;
