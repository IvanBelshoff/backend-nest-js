import type { AuditFieldProfile } from '../types/audit-change.types';

function profile(fields: AuditFieldProfile['fields']): AuditFieldProfile {
  return { fields };
}

export const USUARIO_AUDIT_PROFILE = profile([
  { field: 'nome' },
  { field: 'sobrenome' },
  { field: 'email' },
  { field: 'bloqueado' },
]);

export const USUARIO_ROLES_AUDIT_PROFILE = profile([
  { field: 'regrasIds' },
  { field: 'permissoesIds' },
]);

export const ACL_USUARIO_IDS_AUDIT_PROFILE = profile([{ field: 'usuarioIds' }]);

export const ACL_IA_KNOWLEDGE_AUDIT_PROFILE = profile([
  { field: 'permitirConhecimentoIa' },
]);

export const AGENDAMENTO_AUDIT_PROFILE = profile([
  { field: 'nome' },
  { field: 'ativo' },
  { field: 'frequencia' },
  { field: 'intervalo' },
  { field: 'horas' },
  { field: 'minutos' },
  { field: 'dias_semana' },
  { field: 'cronExpression' },
]);

export const VINCULO_AUDIT_PROFILE = profile([
  { field: 'tipo' },
  { field: 'entidade_tipo' },
  { field: 'entidade_id' },
  { field: 'ativo' },
]);

export const DASHBOARD_AUDIT_PROFILE = profile([
  { field: 'nome' },
  { field: 'url' },
  { field: 'icone' },
  { field: 'privacidade' },
  { field: 'visivel' },
  { field: 'temporario' },
  { field: 'data_expiracao_inicial' },
  { field: 'data_expiracao_final' },
  { field: 'query', mode: 'flagOnly' },
]);

export const RELATORIO_AUDIT_PROFILE = profile([
  { field: 'nome' },
  { field: 'icone' },
  { field: 'privacidade' },
  { field: 'visivel' },
  { field: 'temporario' },
  { field: 'estado' },
  { field: 'limite_linhas' },
  { field: 'timeout_ms' },
  { field: 'id_conexao' },
  { field: 'parametros' },
  { field: 'query', mode: 'flagOnly' },
]);

const SENSITIVE_FIELD_NAMES = new Set([
  'senha',
  'senha_criptografada',
  'password',
  'token',
  'secret',
]);

export function isSensitiveAuditField(field: string): boolean {
  const normalized = field.toLowerCase();
  if (SENSITIVE_FIELD_NAMES.has(normalized)) {
    return true;
  }

  return (
    normalized.includes('senha') ||
    normalized.includes('password') ||
    normalized.includes('token')
  );
}

function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditValue(item));
  }

  if (value && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }

  return value ?? null;
}

export function pickAuditSnapshot<T extends Record<string, unknown>>(
  source: T | null | undefined,
  auditProfile: AuditFieldProfile,
): Record<string, unknown> {
  if (!source) {
    return {};
  }

  const snapshot: Record<string, unknown> = {};

  for (const entry of auditProfile.fields) {
    if (isSensitiveAuditField(entry.field)) {
      continue;
    }

    if (!(entry.field in source)) {
      continue;
    }

    const value = source[entry.field];
    if (entry.mode === 'flagOnly') {
      snapshot[entry.field] = value ?? null;
      continue;
    }

    snapshot[entry.field] = normalizeAuditValue(value);
  }

  return snapshot;
}

export function pickUsuarioAuditSnapshot(user: {
  nome?: string;
  sobrenome?: string;
  email?: string;
  bloqueado?: boolean;
}): Record<string, unknown> {
  return pickAuditSnapshot(
    {
      nome: user.nome,
      sobrenome: user.sobrenome,
      email: user.email,
      bloqueado: user.bloqueado,
    },
    USUARIO_AUDIT_PROFILE,
  );
}

export function pickAgendamentoAuditSnapshot(agendamento: {
  nome: string;
  ativo: boolean;
  frequencia: string;
  intervalo: number;
  horas: number[];
  minutos: number[];
  diasSemana: number[];
  cronExpression: string;
}): Record<string, unknown> {
  return pickAuditSnapshot(
    {
      nome: agendamento.nome,
      ativo: agendamento.ativo,
      frequencia: agendamento.frequencia,
      intervalo: agendamento.intervalo,
      horas: agendamento.horas,
      minutos: agendamento.minutos,
      dias_semana: agendamento.diasSemana,
      cronExpression: agendamento.cronExpression,
    },
    AGENDAMENTO_AUDIT_PROFILE,
  );
}

export function pickVinculoAuditSnapshot(vinculo: {
  tipo: string;
  entidadeTipo: string;
  entidadeId: number;
  ativo: boolean;
}): Record<string, unknown> {
  return pickAuditSnapshot(
    {
      tipo: vinculo.tipo,
      entidade_tipo: vinculo.entidadeTipo,
      entidade_id: vinculo.entidadeId,
      ativo: vinculo.ativo,
    },
    VINCULO_AUDIT_PROFILE,
  );
}

export function pickDashboardAuditSnapshot(dashboard: {
  nome: string;
  url: string;
  icone?: string;
  privacidade?: string;
  visivel?: boolean;
  temporario: boolean;
  data_expiracao_inicial?: Date | string | null;
  data_expiracao_final?: Date | string | null;
  query?: string | null;
}): Record<string, unknown> {
  return pickAuditSnapshot(
    {
      nome: dashboard.nome,
      url: dashboard.url,
      icone: dashboard.icone,
      privacidade: dashboard.privacidade,
      visivel: dashboard.visivel,
      temporario: dashboard.temporario,
      data_expiracao_inicial: dashboard.data_expiracao_inicial,
      data_expiracao_final: dashboard.data_expiracao_final,
      query: dashboard.query ?? null,
    },
    DASHBOARD_AUDIT_PROFILE,
  );
}

export function pickRelatorioAuditSnapshot(relatorio: {
  nome: string;
  icone?: string;
  privacidade?: string;
  visivel?: boolean;
  temporario: boolean;
  estado: string;
  limite_linhas: number;
  timeout_ms: number;
  id_conexao: number;
  parametros?: unknown;
  query: string;
  data_expiracao_inicial?: Date | string | null;
  data_expiracao_final?: Date | string | null;
}): Record<string, unknown> {
  return pickAuditSnapshot(
    {
      nome: relatorio.nome,
      icone: relatorio.icone,
      privacidade: relatorio.privacidade,
      visivel: relatorio.visivel,
      temporario: relatorio.temporario,
      estado: relatorio.estado,
      limite_linhas: relatorio.limite_linhas,
      timeout_ms: relatorio.timeout_ms,
      id_conexao: relatorio.id_conexao,
      parametros: relatorio.parametros,
      query: relatorio.query,
      data_expiracao_inicial: relatorio.data_expiracao_inicial,
      data_expiracao_final: relatorio.data_expiracao_final,
    },
    RELATORIO_AUDIT_PROFILE,
  );
}

export function pickUsuarioIdsAuditSnapshot(usuarioIds: number[]): Record<string, unknown> {
  return { usuarioIds };
}
