import { z } from 'zod';

export const startDiscoverySchema = z
  .object({
    threadId: z.string().uuid(),
    dashboardId: z.coerce.number().int().positive(),
  })
  .strict();

export type StartDiscoveryDto = z.infer<typeof startDiscoverySchema>;

export const explorePlanoSchema = z
  .object({
    abas: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    filtros: z
      .array(
        z
          .object({
            nome: z.string().trim().min(1).max(120),
            valor: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    perguntaAnalitica: z.string().trim().min(1).max(2000),
    objetivo: z.string().trim().max(2000).optional(),
  })
  .strict();

export const confirmAnalysisSchema = z
  .object({
    threadId: z.string().uuid(),
    dashboardId: z.coerce.number().int().positive(),
    plano: explorePlanoSchema,
  })
  .strict();

export type ConfirmAnalysisDto = z.infer<typeof confirmAnalysisSchema>;
