import { Privacidade } from 'src/database/entities/privacidade.enum';
import type { ParametroRelatorio } from 'src/database/entities/Relatorios';

export const REPORT_CATALOG_CONNECTION_NAME = 'DataDash PostgreSQL Local';

export const REPORT_CATALOG_MARKER_NAME = 'Usuários da Aplicação';

export type ReportCatalogSeed = {
  nome: string;
  icone: string;
  query: string;
  parametros: ParametroRelatorio[] | null;
  privacidade: Privacidade;
  visivel: boolean;
  temporario: boolean;
};

export const reportCatalogSeedData: ReportCatalogSeed[] = [
  {
    nome: 'Usuários da Aplicação',
    icone: 'group',
    query: `SELECT
    u.id,
    u.nome,
    u.sobrenome,
    u.email,
    CASE WHEN u.bloqueado THEN 'Bloqueado' ELSE 'Ativo' END AS situacao,
    u.ultimo_login,
    u.data_criacao,
    u.usuario_cadastrador
FROM usuarios u
ORDER BY u.nome, u.sobrenome`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Usuários por Situação',
    icone: 'person_search',
    query: `SELECT
    u.id,
    u.nome || ' ' || u.sobrenome AS nome_completo,
    u.email,
    u.bloqueado,
    u.ultimo_login,
    u.data_criacao
FROM usuarios u
WHERE u.bloqueado = :bloqueado
ORDER BY u.nome, u.sobrenome`,
    parametros: [
      {
        nome: 'bloqueado',
        tipo: 'boolean',
        obrigatorio: true,
        label: 'Somente bloqueados',
        padrao: false,
      },
    ],
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Relatórios Cadastrados',
    icone: 'table_chart',
    query: `SELECT
    r.id,
    r.nome,
    r.icone,
    r.estado,
    r.privacidade,
    r.visivel,
    r.temporario,
    c.nome AS conexao,
    c.tipo AS tipo_conexao,
    r.snapshot_atualizado_em,
    r.snapshot_valido,
    r.data_criacao,
    r.usuario_cadastrador
FROM relatorios r
INNER JOIN conexoes c ON c.id = r.id_conexao
ORDER BY r.nome`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Relatórios por Estado',
    icone: 'filter_list',
    query: `SELECT
    r.id,
    r.nome,
    r.estado,
    r.privacidade,
    r.visivel,
    c.nome AS conexao,
    r.snapshot_atualizado_em,
    r.erro_ultima_geracao,
    r.data_atualizacao
FROM relatorios r
INNER JOIN conexoes c ON c.id = r.id_conexao
WHERE r.estado = :estado
ORDER BY r.nome`,
    parametros: [
      {
        nome: 'estado',
        tipo: 'enum',
        obrigatorio: true,
        label: 'Estado do relatório',
        valores: ['online', 'offline', 'gerando_snapshot'],
        padrao: 'online',
      },
    ],
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Acessos de Usuários a Relatórios',
    icone: 'key',
    query: `SELECT
    u.id AS usuario_id,
    u.nome || ' ' || u.sobrenome AS usuario,
    u.email,
    r.id AS relatorio_id,
    r.nome AS relatorio,
    r.privacidade,
    ur.permitir_conhecimento_ia,
    c.nome AS conexao
FROM usuarios_relatorios ur
INNER JOIN usuarios u ON u.id = ur.usuario_id
INNER JOIN relatorios r ON r.id = ur.relatorio_id
INNER JOIN conexoes c ON c.id = r.id_conexao
ORDER BY usuario, relatorio`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Dashboards Cadastrados',
    icone: 'insert_chart',
    query: `SELECT
    d.id,
    d.nome,
    d.icone,
    d.url,
    d.privacidade,
    d.visivel,
    d.temporario,
    d.data_expiracao_inicial,
    d.data_expiracao_final,
    d.id_proprietario,
    d.data_criacao,
    d.usuario_cadastrador
FROM dashboards d
ORDER BY d.nome`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Conexões de Banco de Dados',
    icone: 'database',
    query: `SELECT
    c.id,
    c.nome,
    c.tipo,
    c.host,
    c.porta,
    c.database,
    c.usuario,
    COUNT(r.id) AS total_relatorios,
    c.data_criacao,
    c.usuario_cadastrador
FROM conexoes c
LEFT JOIN relatorios r ON r.id_conexao = c.id
GROUP BY
    c.id,
    c.nome,
    c.tipo,
    c.host,
    c.porta,
    c.database,
    c.usuario,
    c.data_criacao,
    c.usuario_cadastrador
ORDER BY c.nome`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Jobs de Relatório (Exportação e Snapshot)',
    icone: 'pending_actions',
    query: `SELECT
    j.id AS job_id,
    j.tipo,
    j.status,
    j.progress,
    r.id AS relatorio_id,
    r.nome AS relatorio,
    u.nome || ' ' || u.sobrenome AS solicitante,
    u.email AS email_solicitante,
    j.error_message,
    j.created_at,
    j.completed_at
FROM relatorio_jobs j
INNER JOIN relatorios r ON r.id = j.relatorio_id
INNER JOIN usuarios u ON u.id = j.user_id
WHERE j.status = :status
ORDER BY j.created_at DESC`,
    parametros: [
      {
        nome: 'status',
        tipo: 'enum',
        obrigatorio: true,
        label: 'Status do job',
        valores: ['queued', 'processing', 'completed', 'failed'],
        padrao: 'completed',
      },
    ],
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Agendamentos e Próximas Execuções',
    icone: 'schedule',
    query: `SELECT
    a.id,
    a.nome,
    a.ativo,
    a.frequencia,
    a.intervalo,
    a.cron_expression,
    a.timezone,
    a.proxima_execucao,
    a.ultima_execucao,
    COUNT(av.id) FILTER (WHERE av.ativo = true) AS vinculos_ativos,
    a.data_criacao
FROM agendamentos a
LEFT JOIN agendamento_vinculos av ON av.agendamento_id = a.id
WHERE a.ativo = :ativo
GROUP BY
    a.id,
    a.nome,
    a.ativo,
    a.frequencia,
    a.intervalo,
    a.cron_expression,
    a.timezone,
    a.proxima_execucao,
    a.ultima_execucao,
    a.data_criacao
ORDER BY a.proxima_execucao NULLS LAST, a.nome`,
    parametros: [
      {
        nome: 'ativo',
        tipo: 'boolean',
        obrigatorio: true,
        label: 'Somente ativos',
        padrao: true,
      },
    ],
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
  {
    nome: 'Resumo de Permissões por Usuário',
    icone: 'admin_panel_settings',
    query: `SELECT
    u.id,
    u.nome || ' ' || u.sobrenome AS usuario,
    u.email,
    COALESCE(string_agg(DISTINCT rg.nome, ', ' ORDER BY rg.nome), '') AS regras,
    COALESCE(string_agg(DISTINCT p.nome, ', ' ORDER BY p.nome), '') AS permissoes_diretas,
    COUNT(DISTINCT ur.relatorio_id) AS relatorios_com_acesso,
    COUNT(DISTINCT ud.dashboard_id) AS dashboards_com_acesso
FROM usuarios u
LEFT JOIN usuarios_regras ugr ON ugr.usuario_id = u.id
LEFT JOIN regras rg ON rg.id = ugr.regra_id
LEFT JOIN usuarios_permissoes up ON up.usuario_id = u.id
LEFT JOIN permissoes p ON p.id = up.permissao_id
LEFT JOIN usuarios_relatorios ur ON ur.usuario_id = u.id
LEFT JOIN usuarios_dashboards ud ON ud.usuario_id = u.id
GROUP BY u.id, u.nome, u.sobrenome, u.email
ORDER BY usuario`,
    parametros: null,
    privacidade: Privacidade.PUBLIC,
    visivel: true,
    temporario: false,
  },
];

/** @deprecated Use REPORT_CATALOG_MARKER_NAME */
export const REPORT_SEED_MARKER_NAME = REPORT_CATALOG_MARKER_NAME;

/** @deprecated Use reportCatalogSeedData */
export const reportSeedData = reportCatalogSeedData;
