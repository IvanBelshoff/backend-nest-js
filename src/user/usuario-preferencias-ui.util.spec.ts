import {
  DEFAULT_USUARIO_DATA_GRID_STYLE,
  DEFAULT_USUARIO_PREFERENCIAS_UI,
  mergeUsuarioPreferenciasUi,
  resolveUsuarioPreferenciasUi,
} from './usuario-preferencias-ui.util';

describe('usuario-preferencias-ui.util', () => {
  it('returns defaults when stored preferences are null', () => {
    expect(resolveUsuarioPreferenciasUi(null)).toEqual(
      DEFAULT_USUARIO_PREFERENCIAS_UI,
    );
  });

  it('merges partial patch over stored preferences', () => {
    const stored = {
      ...DEFAULT_USUARIO_PREFERENCIAS_UI,
      accentColor: '#FFB900',
      notification: {
        style: 'topBanner' as const,
        placement: 'top-right' as const,
      },
    };

    const merged = mergeUsuarioPreferenciasUi(stored, {
      theme: 'dark',
      language: 'en-US',
    });

    expect(merged).toEqual({
      version: 1,
      theme: 'dark',
      accentColor: '#FFB900',
      notification: {
        style: 'topBanner',
        placement: 'top-right',
      },
      language: 'en-US',
      dataGridStyle: { ...DEFAULT_USUARIO_DATA_GRID_STYLE },
    });
  });

  it('merges nested notification patch only', () => {
    const merged = mergeUsuarioPreferenciasUi(null, {
      notification: { placement: 'bottom-left' },
    });

    expect(merged.notification).toEqual({
      style: 'circularProgress',
      placement: 'bottom-left',
    });
  });

  it('deep-merges grid layout preferences by gridId', () => {
    const stored = {
      ...DEFAULT_USUARIO_PREFERENCIAS_UI,
      grids: {
        'report-execution': {
          columnOrder: ['a', 'b'],
          columnSizing: { a: 120 },
        },
      },
    };

    const merged = mergeUsuarioPreferenciasUi(stored, {
      grids: {
        'report-execution': {
          columnSizing: { b: 180 },
          sorting: [{ id: 'a', desc: true }],
        },
        'audit-logs': {
          columnSizing: { criado_em: 200 },
        },
      },
    });

    expect(merged.grids).toEqual({
      'report-execution': {
        columnOrder: ['a', 'b'],
        columnSizing: { a: 120, b: 180 },
        sorting: [{ id: 'a', desc: true }],
      },
      'audit-logs': {
        columnSizing: { criado_em: 200 },
      },
    });
  });

  it('preserves stored grids when patch does not include grids', () => {
    const stored = {
      ...DEFAULT_USUARIO_PREFERENCIAS_UI,
      grids: {
        'audit-logs': { columnSizing: { action: 140 } },
      },
    };

    const merged = mergeUsuarioPreferenciasUi(stored, { theme: 'dark' });

    expect(merged.grids).toEqual({
      'audit-logs': { columnSizing: { action: 140 } },
    });
  });

  it('merges partial dataGridStyle patch', () => {
    const merged = mergeUsuarioPreferenciasUi(null, {
      dataGridStyle: { columnLines: 'full', stickyHeader: false },
    });

    expect(merged.dataGridStyle).toEqual({
      ...DEFAULT_USUARIO_DATA_GRID_STYLE,
      columnLines: 'full',
      stickyHeader: false,
    });
  });
});
