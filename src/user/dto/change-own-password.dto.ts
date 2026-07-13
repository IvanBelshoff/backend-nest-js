import { z } from 'zod';

export const changeOwnPasswordSchema = z
  .object({
    senhaAtual: z.string().min(1, 'A senha atual é obrigatória'),
    senha: z
      .string()
      .min(8, 'A senha deve possuir no mínimo 8 caracteres')
      .max(100, 'A senha deve possuir no máximo 100 caracteres'),
  })
  .strict();

export type ChangeOwnPasswordDto = z.infer<typeof changeOwnPasswordSchema>;
