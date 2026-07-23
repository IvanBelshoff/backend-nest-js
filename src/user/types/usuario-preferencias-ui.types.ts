export type UsuarioThemePreference = 'system' | 'dark' | 'light';

export type UsuarioAppLanguage = 'pt-BR' | 'en-US' | 'es-ES';

export type UsuarioNotificationDisplayStyle =
  | 'slideUpBar'
  | 'fadeTopRight'
  | 'scaleCenter'
  | 'slideFromLeft'
  | 'compactPill'
  | 'accentBorderCard'
  | 'stackShrink'
  | 'bounceIn'
  | 'flipIn'
  | 'blurMiniPanel'
  | 'topBanner'
  | 'circularProgress'
  | 'splitReveal'
  | 'minimalStrip'
  | 'timelineStack';

export type UsuarioNotificationPlacement =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type UsuarioNotificationPreferences = {
  style: UsuarioNotificationDisplayStyle;
  placement: UsuarioNotificationPlacement;
};

export type UsuarioDataGridSortPreference = {
  id: string;
  desc: boolean;
};

export type UsuarioDataGridLayoutPreference = {
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
  sorting?: UsuarioDataGridSortPreference[];
};

export type UsuarioDataGridColumnLinesMode = 'none' | 'header' | 'full';

export type UsuarioDataGridStylePreference = {
  columnLines: UsuarioDataGridColumnLinesMode;
  stripedRows: boolean;
  showRowLines: boolean;
  stickyHeader: boolean;
};

export type UsuarioPreferenciasUi = {
  version: 1;
  theme: UsuarioThemePreference;
  accentColor: string;
  notification: UsuarioNotificationPreferences;
  language: UsuarioAppLanguage;
  dataGridStyle?: UsuarioDataGridStylePreference;
  grids?: Record<string, UsuarioDataGridLayoutPreference>;
};
