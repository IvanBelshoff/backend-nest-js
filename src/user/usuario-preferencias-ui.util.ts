import type { UsuarioPreferenciasUi } from './types/usuario-preferencias-ui.types';
import type { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

export const DEFAULT_USUARIO_PREFERENCIAS_UI: UsuarioPreferenciasUi = {
  version: 1,
  theme: 'system',
  accentColor: '#0078D4',
  notification: {
    style: 'circularProgress',
    placement: 'bottom-right',
  },
  language: 'pt-BR',
};

export function resolveUsuarioPreferenciasUi(
  stored: UsuarioPreferenciasUi | null | undefined,
): UsuarioPreferenciasUi {
  if (!stored) {
    return { ...DEFAULT_USUARIO_PREFERENCIAS_UI };
  }

  return {
    ...DEFAULT_USUARIO_PREFERENCIAS_UI,
    ...stored,
    notification: {
      ...DEFAULT_USUARIO_PREFERENCIAS_UI.notification,
      ...stored.notification,
    },
  };
}

export function mergeUsuarioPreferenciasUi(
  current: UsuarioPreferenciasUi | null | undefined,
  patch: UpdateUserPreferencesDto,
): UsuarioPreferenciasUi {
  const base = resolveUsuarioPreferenciasUi(current);

  return {
    version: 1,
    theme: patch.theme ?? base.theme,
    accentColor: patch.accentColor ?? base.accentColor,
    language: patch.language ?? base.language,
    notification: {
      style: patch.notification?.style ?? base.notification.style,
      placement: patch.notification?.placement ?? base.notification.placement,
    },
  };
}
