import { env } from 'src/shared/env.schema';
import type { AuditFieldChange } from '../types/audit-change.types';
import { buildAuditMetadata } from './build-audit-changes.util';

export function toAuditRecordMetadata(
  changes: AuditFieldChange[],
  context?: Record<string, unknown>,
): Record<string, unknown> {
  if (!env.AUDIT_DIFF_ENABLED) {
    return context ?? {};
  }

  return buildAuditMetadata(changes, context);
}
