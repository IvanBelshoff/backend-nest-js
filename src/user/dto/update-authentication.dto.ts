import { z } from 'zod';

export const updateAuthenticationSchema = z
  .object({
    regras: z.array(z.coerce.number().int().positive()).default([]),
    permissoes: z.array(z.coerce.number().int().positive()).default([]),
  })
  .strict();

export type UpdateAuthenticationDto = z.infer<typeof updateAuthenticationSchema>;
