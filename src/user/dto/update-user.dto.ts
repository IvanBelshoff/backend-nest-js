import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

export const updateUserSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, 'Nome deve possuir pelo menos 3 caracteres')
      .max(100, 'Nome deve possuir no máximo 100 caracteres')
      .optional(),

    sobrenome: z
      .string()
      .trim()
      .min(3, 'Sobrenome deve possuir pelo menos 3 caracteres')
      .max(100, 'Sobrenome deve possuir no máximo 100 caracteres')
      .optional(),

    email: z.string().trim().email('E-mail inválido').optional(),

    bloqueado: booleanish.optional(),
  })
  .strict();

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
