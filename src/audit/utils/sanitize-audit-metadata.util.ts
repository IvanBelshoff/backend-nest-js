const SENSITIVE_KEY_PATTERN =
  /(senha|password|token|secret|authorization|cookie|senha_criptografada|refresh)/i;

export function sanitizeAuditMetadata(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 4) {
    return '[truncated]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[redacted]';
      continue;
    }

    result[key] = sanitizeAuditMetadata(nested, depth + 1);
  }

  return result;
}
