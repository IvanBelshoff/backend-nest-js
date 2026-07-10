import {
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
});
