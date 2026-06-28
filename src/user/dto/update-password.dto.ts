import { z } from 'zod';

export const updatePasswordSchema = z
  .object({
    senha: z
      .string()
      .min(8, 'A senha deve possuir no mínimo 8 caracteres')
      .max(100, 'A senha deve possuir no máximo 100 caracteres'),
  })
  .strict();

export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
