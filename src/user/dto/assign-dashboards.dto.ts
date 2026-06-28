import { z } from 'zod';

export const assignDashboardsSchema = z
  .object({
    dashboards: z.array(z.coerce.number().int().positive()),
  })
  .strict();

export type AssignDashboardsDto = z.infer<typeof assignDashboardsSchema>;
