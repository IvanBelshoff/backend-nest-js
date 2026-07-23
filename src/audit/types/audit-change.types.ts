export type AuditChangeSummary = 'modified' | 'truncated';

/** V2 metadata contract — field-level diff for audit logs. */
export interface AuditFieldChange {
  field: string;
  from: unknown | null;
  to: unknown | null;
  summary?: AuditChangeSummary;
  added?: number[];
  removed?: number[];
}

export interface AuditMetadataV2 {
  changes?: AuditFieldChange[];
  context?: Record<string, unknown>;
}

export type AuditFieldMode = 'full' | 'flagOnly';

export interface AuditFieldProfileEntry {
  field: string;
  mode?: AuditFieldMode;
}

export interface AuditFieldProfile {
  fields: AuditFieldProfileEntry[];
}

export const AUDIT_MAX_STRING_LENGTH = 500;
export const AUDIT_ACL_COMPACT_THRESHOLD = 20;
