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
    const usuarios = [
      {
        id: 99,
        nome: 'Novo',
        sobrenome: 'Usuario',
        email: 'novo@empresa.com',
      },
    ];

    const changes = buildAuditChanges(
      { usuarioIds: before },
      { usuarioIds: after },
      { fields: [{ field: 'usuarioIds' }] },
      { usuarioDisplaySources: usuarios },
    );

    expect(changes[0]).toMatchObject({
      field: 'usuarioIds',
      added: [99],
      removed: [],
      addedDisplay: ['Novo Usuario (novo@empresa.com) #99'],
      removedDisplay: [],
    });
  });

  it('builds ACL display labels for small lists', () => {
    const usuarios = [
      {
        id: 4,
        nome: 'Maria',
        sobrenome: 'Souza',
        email: 'maria@empresa.com',
      },
      {
        id: 1,
        nome: 'Admin',
        sobrenome: '',
        email: 'admin@silexcode.com',
      },
      {
        id: 3,
        nome: 'João',
        sobrenome: 'Silva',
        email: 'joao@empresa.com',
      },
    ];

    const changes = buildAuditChanges(
      { usuarioIds: [4, 1] },
      { usuarioIds: [3, 4, 1] },
      { fields: [{ field: 'usuarioIds' }] },
      { usuarioDisplaySources: usuarios },
    );

    expect(changes[0]).toEqual({
      field: 'usuarioIds',
      from: [4, 1],
      to: [3, 4, 1],
      fromDisplay: [
        'Maria Souza (maria@empresa.com) #4',
        'Admin (admin@silexcode.com) #1',
      ],
      toDisplay: [
        'João Silva (joao@empresa.com) #3',
        'Maria Souza (maria@empresa.com) #4',
        'Admin (admin@silexcode.com) #1',
      ],
    });
  });

  it('falls back to usuario id when display source is missing', () => {
    const changes = buildAuditChanges(
      { usuarioIds: [42] },
      { usuarioIds: [42, 7] },
      { fields: [{ field: 'usuarioIds' }] },
    );

    expect(changes[0]?.fromDisplay).toEqual(['Usuário #42']);
    expect(changes[0]?.toDisplay).toEqual(['Usuário #42', 'Usuário #7']);
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
