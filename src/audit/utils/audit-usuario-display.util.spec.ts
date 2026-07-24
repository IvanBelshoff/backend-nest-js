import {
  buildAuditUsuarioDisplayLabels,
  buildAuditUsuarioDisplayMap,
  formatAuditUsuarioDisplay,
  formatAuditUsuarioDisplayById,
} from './audit-usuario-display.util';

describe('audit-usuario-display.util', () => {
  const maria = {
    id: 4,
    nome: 'Maria',
    sobrenome: 'Souza',
    email: 'maria@empresa.com',
  };

  it('formats usuario display with id suffix', () => {
    expect(formatAuditUsuarioDisplay(maria)).toBe('Maria Souza (maria@empresa.com) #4');
  });

  it('falls back to usuario id label', () => {
    expect(formatAuditUsuarioDisplayById(99)).toBe('Usuário #99');
  });

  it('builds display labels in id order', () => {
    const map = buildAuditUsuarioDisplayMap([maria]);

    expect(buildAuditUsuarioDisplayLabels([4, 99], map)).toEqual([
      'Maria Souza (maria@empresa.com) #4',
      'Usuário #99',
    ]);
  });
});
