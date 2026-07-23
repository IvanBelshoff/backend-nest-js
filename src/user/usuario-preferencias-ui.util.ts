import type {
  UsuarioDataGridLayoutPreference,
  UsuarioDataGridStylePreference,
  UsuarioPreferenciasUi,
} from './types/usuario-preferencias-ui.types';
import type { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

export const DEFAULT_USUARIO_DATA_GRID_STYLE: UsuarioDataGridStylePreference = {
  columnLines: 'none',
  stripedRows: true,
  showRowLines: true,
  stickyHeader: true,
};

export const DEFAULT_USUARIO_PREFERENCIAS_UI: UsuarioPreferenciasUi = {
  version: 1,
  theme: 'system',
  accentColor: '#0078D4',
  notification: {
    style: 'circularProgress',
    placement: 'bottom-right',
  },
  language: 'pt-BR',
  dataGridStyle: { ...DEFAULT_USUARIO_DATA_GRID_STYLE },
};

function mergeGridLayoutPreference(
  current: UsuarioDataGridLayoutPreference | undefined,
  patch: UsuarioDataGridLayoutPreference,
): UsuarioDataGridLayoutPreference {
  return {
    columnOrder: patch.columnOrder ?? current?.columnOrder,
    columnSizing: {
      ...current?.columnSizing,
      ...patch.columnSizing,
    },
    sorting: patch.sorting ?? current?.sorting,
  };
}

function mergeGridLayouts(
  current: Record<string, UsuarioDataGridLayoutPreference> | undefined,
  patch: Record<string, UsuarioDataGridLayoutPreference>,
): Record<string, UsuarioDataGridLayoutPreference> {
  const merged: Record<string, UsuarioDataGridLayoutPreference> = {
    ...current,
  };

  for (const [gridId, gridPatch] of Object.entries(patch)) {
    merged[gridId] = mergeGridLayoutPreference(current?.[gridId], gridPatch);
  }

  return merged;
}

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
    dataGridStyle: {
      ...DEFAULT_USUARIO_DATA_GRID_STYLE,
      ...stored.dataGridStyle,
    },
    grids: stored.grids ? { ...stored.grids } : undefined,
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
    dataGridStyle: {
      columnLines:
        patch.dataGridStyle?.columnLines ??
        base.dataGridStyle?.columnLines ??
        DEFAULT_USUARIO_DATA_GRID_STYLE.columnLines,
      stripedRows:
        patch.dataGridStyle?.stripedRows ??
        base.dataGridStyle?.stripedRows ??
        DEFAULT_USUARIO_DATA_GRID_STYLE.stripedRows,
      showRowLines:
        patch.dataGridStyle?.showRowLines ??
        base.dataGridStyle?.showRowLines ??
        DEFAULT_USUARIO_DATA_GRID_STYLE.showRowLines,
      stickyHeader:
        patch.dataGridStyle?.stickyHeader ??
        base.dataGridStyle?.stickyHeader ??
        DEFAULT_USUARIO_DATA_GRID_STYLE.stickyHeader,
    },
    grids:
      patch.grids !== undefined
        ? mergeGridLayouts(base.grids, patch.grids)
        : base.grids,
  };
}
