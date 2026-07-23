import { z } from 'zod';

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  actorUserId: z.coerce.number().int().positive().optional(),
  action: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().min(1).max(200).optional(),
});

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
