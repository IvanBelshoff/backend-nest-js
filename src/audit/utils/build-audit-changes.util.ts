import type {
  AuditFieldChange,
  AuditFieldProfile,
} from '../types/audit-change.types';
import {
  AUDIT_ACL_COMPACT_THRESHOLD,
  AUDIT_MAX_STRING_LENGTH,
} from '../types/audit-change.types';

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (left == null || right == null) {
    return false;
  }

  if (typeof left === 'object' || typeof right === 'object') {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  return false;
}

function truncateStringValue(value: string): {
  value: string;
  truncated: boolean;
} {
  if (value.length <= AUDIT_MAX_STRING_LENGTH) {
    return { value, truncated: false };
  }

  return {
    value: `${value.slice(0, AUDIT_MAX_STRING_LENGTH)}…`,
    truncated: true,
  };
}

function serializeAuditValue(value: unknown): {
  value: unknown;
  summary?: 'truncated';
} {
  if (value == null) {
    return { value: null };
  }

  if (value instanceof Date) {
    return { value: value.toISOString() };
  }

  if (typeof value === 'string') {
    const truncated = truncateStringValue(value);
    return {
      value: truncated.value,
      summary: truncated.truncated ? 'truncated' : undefined,
    };
  }

  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    const json = JSON.stringify(value);
    if (json.length > AUDIT_MAX_STRING_LENGTH) {
      return {
        value: JSON.parse(json.slice(0, AUDIT_MAX_STRING_LENGTH)),
        summary: 'truncated',
      };
    }
    return { value };
  }

  return { value };
}

function buildAclUsuarioIdsChange(
  field: string,
  before: unknown,
  after: unknown,
): AuditFieldChange | null {
  const beforeIds = Array.isArray(before)
    ? before.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const afterIds = Array.isArray(after)
    ? after.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  if (valuesEqual(beforeIds, afterIds)) {
    return null;
  }

  if (
    beforeIds.length > AUDIT_ACL_COMPACT_THRESHOLD ||
    afterIds.length > AUDIT_ACL_COMPACT_THRESHOLD
  ) {
    const beforeSet = new Set(beforeIds);
    const afterSet = new Set(afterIds);
    const added = afterIds.filter((id) => !beforeSet.has(id));
    const removed = beforeIds.filter((id) => !afterSet.has(id));

    return {
      field,
      from: null,
      to: null,
      added,
      removed,
    };
  }

  return {
    field,
    from: beforeIds,
    to: afterIds,
  };
}

export function buildAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  profile: AuditFieldProfile,
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];

  for (const entry of profile.fields) {
    const field = entry.field;
    const beforeValue = before[field] ?? null;
    const afterValue = after[field] ?? null;

    if (entry.mode === 'flagOnly') {
      if (!valuesEqual(beforeValue, afterValue)) {
        changes.push({
          field,
          from: null,
          to: null,
          summary: 'modified',
        });
      }
      continue;
    }

    if (field === 'usuarioIds') {
      const aclChange = buildAclUsuarioIdsChange(field, beforeValue, afterValue);
      if (aclChange) {
        changes.push(aclChange);
      }
      continue;
    }

    if (valuesEqual(beforeValue, afterValue)) {
      continue;
    }

    const serializedBefore = serializeAuditValue(beforeValue);
    const serializedAfter = serializeAuditValue(afterValue);
    const summary =
      serializedBefore.summary === 'truncated' ||
      serializedAfter.summary === 'truncated'
        ? 'truncated'
        : undefined;

    changes.push({
      field,
      from: serializedBefore.value,
      to: serializedAfter.value,
      ...(summary ? { summary } : {}),
    });
  }

  return changes;
}

export function buildAuditCreateChanges(
  after: Record<string, unknown>,
  profile: AuditFieldProfile,
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];

  for (const entry of profile.fields) {
    const field = entry.field;
    const value = after[field] ?? null;

    if (entry.mode === 'flagOnly') {
      if (value != null && value !== '') {
        changes.push({
          field,
          from: null,
          to: null,
          summary: 'modified',
        });
      }
      continue;
    }

    if (value == null) {
      continue;
    }

    const serialized = serializeAuditValue(value);
    changes.push({
      field,
      from: null,
      to: serialized.value,
      ...(serialized.summary ? { summary: serialized.summary } : {}),
    });
  }

  return changes;
}

export function buildAuditDeleteChanges(
  before: Record<string, unknown>,
  profile: AuditFieldProfile,
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];

  for (const entry of profile.fields) {
    const field = entry.field;
    const value = before[field] ?? null;

    if (entry.mode === 'flagOnly') {
      if (value != null && value !== '') {
        changes.push({
          field,
          from: null,
          to: null,
          summary: 'modified',
        });
      }
      continue;
    }

    if (value == null) {
      continue;
    }

    const serialized = serializeAuditValue(value);
    changes.push({
      field,
      from: serialized.value,
      to: null,
      ...(serialized.summary ? { summary: serialized.summary } : {}),
    });
  }

  return changes;
}

export function buildAuditMetadata(
  changes: AuditFieldChange[],
  context?: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { changes };

  if (context && Object.keys(context).length > 0) {
    metadata.context = context;
  }

  return metadata;
}
