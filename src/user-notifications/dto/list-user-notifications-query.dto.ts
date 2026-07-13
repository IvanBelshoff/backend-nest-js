import { z } from 'zod';

export const listUserNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    page_size: z.coerce.number().int().positive().max(100).default(20),
    unread_only: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

export type ListUserNotificationsQueryDto = z.infer<
  typeof listUserNotificationsQuerySchema
>;
