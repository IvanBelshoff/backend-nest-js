import { z } from 'zod';

export const copyAuthenticationSchema = z
  .object({
    id_usuario: z.coerce.number().int().positive(),
    id_copiado: z.coerce.number().int().positive(),
  })
  .strict();

export type CopyAuthenticationDto = z.infer<typeof copyAuthenticationSchema>;
