import { z } from 'zod';

export const createUserSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .min(3, 'Nome deve possuir pelo menos 3 caracteres')
      .max(100, 'Nome deve possuir no máximo 100 caracteres'),

    sobrenome: z
      .string()
      .trim()
      .min(1, 'Sobrenome é obrigatório')
      .min(3, 'Sobrenome deve possuir pelo menos 3 caracteres')
      .max(100, 'Sobrenome deve possuir no máximo 100 caracteres'),

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

export type CreateUserDto = z.infer<typeof createUserSchema>;
