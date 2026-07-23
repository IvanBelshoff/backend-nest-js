import { z } from 'zod';

const auditSortColumns = [
  'criado_em',
  'action',
  'category',
  'outcome',
  'actor_email',
  'resource_type',
] as const;

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
  sort: z
    .string()
    .trim()
    .regex(
      /^(criado_em|action|category|outcome|actor_email|resource_type):(asc|desc)$/,
      'Sort inválido. Use coluna:asc ou coluna:desc',
    )
    .optional(),
});

export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
export const AUDIT_SORT_COLUMNS = auditSortColumns;
