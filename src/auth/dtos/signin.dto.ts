import { z } from 'zod';

export const signinSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'E-mail é obrigatório')
      .email('E-mail inválido'),

    senha: z
      .string()
      .min(1, 'Senha é obrigatória')
      .min(8, 'A senha deve possuir no mínimo 8 caracteres')
      .max(100, 'A senha deve possuir no máximo 100 caracteres'),
  })
  .strict();

export type SigninDto = z.infer<typeof signinSchema>;
