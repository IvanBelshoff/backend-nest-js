import { DASHBOARD_AUDIT_PROFILE } from './audit-field-profiles';
import { isSensitiveAuditField } from './audit-field-profiles';
import {
  buildAuditChanges,
  buildAuditCreateChanges,
} from './build-audit-changes.util';

describe('build-audit-changes', () => {
  it('builds primitive field changes', () => {
    const changes = buildAuditChanges(
      { nome: 'Antigo' },
      { nome: 'Novo' },
      DASHBOARD_AUDIT_PROFILE,
    );

    expect(changes).toEqual([
      { field: 'nome', from: 'Antigo', to: 'Novo' },
    ]);
  });

  it('flags query changes without storing content', () => {
    const changes = buildAuditChanges(
      { query: 'SELECT 1' },
      { query: 'SELECT 2' },
      DASHBOARD_AUDIT_PROFILE,
    );

    expect(changes).toEqual([
      {
        field: 'query',
        from: null,
        to: null,
        summary: 'modified',
      },
    ]);
  });

  it('builds ACL added/removed when lists are large', () => {
    const before = Array.from({ length: 25 }, (_, index) => index + 1);
    const after = [...before, 99];

    const changes = buildAuditChanges(
      { usuarioIds: before },
      { usuarioIds: after },
      { fields: [{ field: 'usuarioIds' }] },
    );

    expect(changes[0]).toMatchObject({
      field: 'usuarioIds',
      added: [99],
      removed: [],
    });
  });

  it('truncates long strings', () => {
    const long = 'a'.repeat(600);
    const changes = buildAuditCreateChanges({ nome: long }, DASHBOARD_AUDIT_PROFILE);

    expect(changes[0]?.summary).toBe('truncated');
    expect(String(changes[0]?.to).length).toBeLessThanOrEqual(501);
  });
});

describe('audit-field-profiles', () => {
  it('does not include sensitive fields', () => {
    expect(isSensitiveAuditField('senha_criptografada')).toBe(true);
    expect(isSensitiveAuditField('nome')).toBe(false);
  });
});
