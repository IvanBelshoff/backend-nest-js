import { z } from 'zod';

const usuarioGrantSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export const assignReportUsersSchema = z
  .object({
    usuarios: z.array(usuarioGrantSchema),
  })
  .strict();

export type AssignReportUsersDto = z.infer<typeof assignReportUsersSchema>;
