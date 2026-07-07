import { RoleController } from './role.controller';

describe('RoleController', () => {
  it('returns all roles from the service', async () => {
    const roles = [
      {
        id: 1,
        nome: 'REGRA_ADMIN',
        descricao: 'Administrador',
        permissao: [],
      },
      {
        id: 2,
        nome: 'REGRA_DASHBOARD',
        descricao: 'Dashboard',
        permissao: [{ id: 10, nome: 'PERMISSAO_CRIAR_DASHBOARD' }],
      },
    ];
    const roleService = {
      findAll: jest.fn().mockResolvedValue(roles),
    };
    const controller = new RoleController(roleService as any);

    await expect(controller.findAll()).resolves.toEqual(roles);
    expect(roleService.findAll).toHaveBeenCalledWith();
  });
});
