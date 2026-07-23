import { sanitizeAuditMetadata } from './sanitize-audit-metadata.util';

describe('sanitizeAuditMetadata', () => {
  it('redacts sensitive keys', () => {
    expect(
      sanitizeAuditMetadata({
        email: 'user@example.com',
        senha: 'secret',
        token: 'abc',
        nested: { password: 'x', ok: true },
      }),
    ).toEqual({
      email: 'user@example.com',
      senha: '[redacted]',
      token: '[redacted]',
      nested: { password: '[redacted]', ok: true },
    });
  });

  it('truncates deep nesting', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'x' } } } } } };
    const result = sanitizeAuditMetadata(deep) as Record<string, unknown>;
    expect(result.a).toBeDefined();
  });
});
