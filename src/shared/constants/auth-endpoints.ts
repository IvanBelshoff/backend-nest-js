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
    'PATCH /user/dashboards/favorites/:id': { self: true },
    'PATCH /user/dashboards/:id': {
      permission: ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'],
    },
    'PATCH /user/authentication/:id': { role: ['REGRA_ADMIN'] },
    'PATCH /user/password/:id': { self: true },
    'PATCH /user/:id': { permission: ['PERMISSAO_ATUALIZAR_USUARIO'] },
    'DELETE /user/photo/:id': { self: true },
    'DELETE /user/:id': { permission: ['PERMISSAO_DELETAR_USUARIO'] },
  },
  dashboards: {
    'POST /dashboards': {
      role: ['REGRA_DASHBOARD'],
      permission: ['PERMISSAO_CRIAR_DASHBOARD'],
    },
    'GET /dashboards': { role: ['REGRA_DASHBOARD'] },
    'GET /dashboards/filters': { role: ['REGRA_DASHBOARD'] },
    'GET /dashboards/:id': { role: ['REGRA_DASHBOARD'] },
    'PATCH /dashboards/users/:id': {
      permission: ['PERMISSAO_CONCEDER_ACESSO_USUARIO'],
    },
    'PATCH /dashboards/:id': {
      permission: ['PERMISSAO_ATUALIZAR_DASHBOARD'],
    },
    'DELETE /dashboards/:id': {
      permission: ['PERMISSAO_DELETAR_DASHBOARD'],
    },
  },
} as const;
