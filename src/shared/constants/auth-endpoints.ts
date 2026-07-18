/**
 * Matriz de autorização por endpoint.
 * - role: exige regra atribuída ao usuário (admin bypass)
 * - permission: exige permissão compatível com as regras do usuário (admin bypass)
 * - self: ResourceOwnerGuard — JWT sub === :id ou admin
 * - selfOrRole: ResourceOwnerGuard — self, admin ou role listada
 */
export const AUTH_ENDPOINT_MATRIX = {
  user: {
    'POST /user': { role: ['REGRA_ADMIN'] },
    'GET /user': { role: ['REGRA_USUARIO'] },
    'GET /user/ids': { role: ['REGRA_USUARIO'] },
    'GET /user/dashboards/:id': { role: ['REGRA_DASHBOARD'] },
    'GET /user/:id': { selfOrRole: ['REGRA_USUARIO'] },
    'PATCH /user/copy/authentication': { role: ['REGRA_ADMIN'] },
    'PATCH /user/copy/dashboards': { role: ['REGRA_ADMIN'] },
    'PATCH /user/copy/relatorios': { role: ['REGRA_ADMIN'] },
    'GET /user/relatorios/:id': { role: ['REGRA_RELATORIO'] },
    'PATCH /user/dashboards/favorites/:id': { self: true },
    'PATCH /user/relatorios/favorites/:id': { self: true },
    'PATCH /user/dashboards/:id': {
      role: ['REGRA_USUARIO'],
      permission: ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'],
    },
    'PATCH /user/relatorios/:id': {
      role: ['REGRA_USUARIO'],
      permission: ['PERMISSAO_CONCEDER_ACESSO_RELATORIO'],
    },
    'PATCH /user/authentication/:id': { role: ['REGRA_ADMIN'] },
    'PATCH /user/password/:id': { self: true },
    'PATCH /user/:id': { permission: ['PERMISSAO_ATUALIZAR_USUARIO'] },
    'DELETE /user/photo/:id': { self: true },
    'DELETE /user/:id': { permission: ['PERMISSAO_EXCLUIR_USUARIO'] },
    'GET /user/me/notifications': { self: true },
    'GET /user/me/notifications/unread-count': { self: true },
    'PATCH /user/me/notifications/:id/read': { self: true },
    'PATCH /user/me/notifications/read-all': { self: true },
    'GET /user/me/summary': { self: true },
    'PATCH /user/me/photo': { self: true },
    'PATCH /user/me/password': { self: true },
  },
  dashboards: {
    'POST /dashboards': {
      role: ['REGRA_DASHBOARD'],
      permission: ['PERMISSAO_CRIAR_DASHBOARD'],
    },
    'GET /dashboards': { role: ['REGRA_DASHBOARD'] },
    'GET /dashboards/filters': { role: ['REGRA_DASHBOARD'] },
    'GET /dashboards/users/:id': {
      role: ['REGRA_USUARIO'],
      permission: ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'],
    },
    'GET /dashboards/:id': { role: ['REGRA_DASHBOARD'] },
    'PATCH /dashboards/users/:id': {
      permission: ['PERMISSAO_CONCEDER_ACESSO_USUARIO'],
    },
    'PATCH /dashboards/:id': {
      permission: ['PERMISSAO_ATUALIZAR_DASHBOARD'],
    },
    'DELETE /dashboards/:id': {
      permission: ['PERMISSAO_EXCLUIR_DASHBOARD'],
    },
  },
  conexoes: {
    'POST /conexoes': {
      role: ['REGRA_RELATORIO'],
      permission: ['PERMISSAO_CRIAR_CONEXAO'],
    },
    'GET /conexoes': { role: ['REGRA_RELATORIO'] },
    'GET /conexoes/:id': { role: ['REGRA_RELATORIO'] },
    'PATCH /conexoes/:id': { permission: ['PERMISSAO_ATUALIZAR_CONEXAO'] },
    'DELETE /conexoes/:id': { permission: ['PERMISSAO_EXCLUIR_CONEXAO'] },
    'POST /conexoes/:id/testar': { role: ['REGRA_RELATORIO'] },
  },
  relatorios: {
    'POST /relatorios': {
      role: ['REGRA_RELATORIO'],
      permission: ['PERMISSAO_CRIAR_RELATORIO'],
    },
    'GET /relatorios': { role: ['REGRA_RELATORIO'] },
    'GET /relatorios/filters': { role: ['REGRA_RELATORIO'] },
    'GET /relatorios/users/:id': {
      role: ['REGRA_USUARIO'],
      permission: ['PERMISSAO_CONCEDER_ACESSO_RELATORIO'],
    },
    'GET /relatorios/:id': { role: ['REGRA_RELATORIO'] },
    'PATCH /relatorios/users/:id': {
      permission: ['PERMISSAO_CONCEDER_ACESSO_RELATORIO'],
    },
    'PATCH /relatorios/:id': {
      permission: ['PERMISSAO_ATUALIZAR_RELATORIO'],
    },
    'POST /relatorios/:id/snapshot/atualizar': {
      permission: ['PERMISSAO_ATUALIZAR_RELATORIO'],
    },
    'GET /relatorios/:id/snapshot/historico': { role: ['REGRA_RELATORIO'] },
    'DELETE /relatorios/:id': {
      permission: ['PERMISSAO_EXCLUIR_RELATORIO'],
    },
    'POST /relatorios/:id/agendamento-snapshot': {
      permission: ['PERMISSAO_ATUALIZAR_RELATORIO'],
    },
    'GET /relatorios/:id/agendamento-snapshot': { role: ['REGRA_RELATORIO'] },
    'DELETE /relatorios/:id/agendamento-snapshot': {
      permission: ['PERMISSAO_ATUALIZAR_RELATORIO'],
    },
    'GET /relatorios/:id/agendamento-snapshot/execucoes': {
      role: ['REGRA_RELATORIO'],
    },
  },
  agendamentos: {
    'POST /agendamentos': { role: ['REGRA_ADMIN'] },
    'PATCH /agendamentos/:id': { role: ['REGRA_ADMIN'] },
    'DELETE /agendamentos/:id': { role: ['REGRA_ADMIN'] },
    'POST /agendamentos/:id/vinculos': { role: ['REGRA_ADMIN'] },
    'DELETE /agendamentos/vinculos/:vinculoId': { role: ['REGRA_ADMIN'] },
    'GET /agendamentos/vinculos': { role: ['REGRA_ADMIN'] },
    'GET /agendamentos/vinculos/:vinculoId/execucoes': { role: ['REGRA_ADMIN'] },
  },
  admin: {
    'GET /admin/metrics/live': { role: ['REGRA_ADMIN'] },
    'GET /admin/metrics/current': { role: ['REGRA_ADMIN'] },
    'GET /admin/metrics/history': { role: ['REGRA_ADMIN'] },
    'GET /admin/jobs': { role: ['REGRA_ADMIN'] },
    'GET /admin/jobs/schedules': { role: ['REGRA_ADMIN'] },
  },
  ai: {
    'GET /ai/access': { role: ['REGRA_IA'] },
    'GET /ai/mentions/relatorios': { role: ['REGRA_IA'] },
    'GET /ai/threads': { role: ['REGRA_IA'] },
    'POST /ai/threads': { role: ['REGRA_IA'] },
    'GET /ai/threads/:id/messages': { role: ['REGRA_IA'] },
    'DELETE /ai/threads/:id': { role: ['REGRA_IA'] },
    'POST /ai/chat': { role: ['REGRA_IA'] },
  },
} as const;
