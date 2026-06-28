import { z } from 'zod';

export const assignUsersSchema = z
  .object({
    usuarios: z.array(z.coerce.number().int().positive()),
  })
  .strict();

export type AssignUsersDto = z.infer<typeof assignUsersSchema>;
