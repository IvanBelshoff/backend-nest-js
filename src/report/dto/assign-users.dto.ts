import { z } from 'zod';

export const assignReportUsersSchema = z
  .object({
    usuarios: z.array(z.coerce.number().int().positive()),
  })
  .strict();

export type AssignReportUsersDto = z.infer<typeof assignReportUsersSchema>;
