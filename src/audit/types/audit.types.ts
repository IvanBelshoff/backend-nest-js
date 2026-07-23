export type AuditActorType = 'user' | 'system' | 'anonymous';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export type AuditCategory =
  | 'auth'
  | 'user'
  | 'acl'
  | 'dashboard'
  | 'report'
  | 'connection'
  | 'scheduler';

export interface AuditActor {
  userId?: number | null;
  email?: string | null;
  type: AuditActorType;
}

export interface AuditResource {
  type: string;
  id?: string | number | null;
}

export interface AuditHttpContext {
  method?: string;
  path?: string;
  status_code?: number;
  ip?: string;
  user_agent?: string;
}

export type { AuditFieldChange, AuditMetadataV2 } from './audit-change.types';

export interface AuditRecordInput {
  actor: AuditActor;
  action: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  resource?: AuditResource | null;
  http?: AuditHttpContext;
  metadata?: Record<string, unknown>;
  correlation_id?: string | null;
}

export interface AuditLogListItem {
  id: string;
  actor_user_id: number | null;
  actor_email: string | null;
  actor_type: AuditActorType;
  action: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  resource_type: string | null;
  resource_id: string | number | null;
  criado_em: Date;
}

export interface AuditLogListResult {
  items: AuditLogListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditLogItem {
  id: string;
  actor_user_id: number | null;
  actor_email: string | null;
  actor_type: AuditActorType;
  action: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  resource_type: string | null;
  resource_id: string | number | null;
  http?: AuditHttpContext;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
  criado_em: Date;
}
