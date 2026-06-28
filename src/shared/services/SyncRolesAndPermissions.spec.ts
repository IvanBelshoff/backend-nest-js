import { SyncRolesAndPermissions } from './SyncRolesAndPermissions';
import { Regra } from 'src/database/entities/Regras';

describe('SyncRolesAndPermissions', () => {
  const permissionRepository = {
    find: jest.fn(),
  };

  const roleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const permissionService = {
    create: jest.fn(),
    updateById: jest.fn(),
    delete: jest.fn(),
  };

  const roleService = {
    create: jest.fn(),
    updateById: jest.fn(),
    delete: jest.fn(),
  };

  const relationMock = {
    of: jest.fn().mockReturnThis(),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const buildService = () =>
    new SyncRolesAndPermissions(
      permissionRepository as any,
      roleRepository as any,
      permissionService as any,
      roleService as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    roleRepository.createQueryBuilder.mockReturnValue({
      relation: jest.fn().mockReturnValue(relationMock),
    });
  });

  it('renameRoleIfNeeded updates role via roleService', async () => {
    const service = buildService();
    const regrasBD = [{ id: 1, nome: 'REGRA_OLD' }] as Regra[];
    const regrasRemovidas = [{ id: 1, nome: 'REGRA_OLD' }] as Regra[];

    roleService.updateById.mockResolvedValue(undefined);

    const result = await (service as any).renameRoleIfNeeded(
      regrasBD,
      [{ nome: 'REGRA_NEW', permissoes: [] }],
      regrasRemovidas,
    );

    expect(result).toBe(true);
    expect(roleService.updateById).toHaveBeenCalledWith(1, {
      nome: 'REGRA_NEW',
      descricao: expect.any(String),
    });
    expect(permissionService.updateById).not.toHaveBeenCalled();
  });

  it('removeRoles detaches users and deletes role', async () => {
    const service = buildService();
    roleService.delete.mockResolvedValue(undefined);

    await (service as any).removeRoles([
      { id: 5, nome: 'REGRA_TEST' },
    ] as Regra[]);

    expect(relationMock.of).toHaveBeenCalledWith(5);
    expect(relationMock.set).toHaveBeenCalledWith([]);
    expect(roleService.delete).toHaveBeenCalledWith(5);
  });

  it('removeRoles skips REGRA_ADMIN', async () => {
    const service = buildService();
    roleRepository.find.mockResolvedValue([]);

    await (service as any).removeRoles([
      { id: 1, nome: 'REGRA_ADMIN' },
    ] as Regra[]);

    expect(roleService.delete).not.toHaveBeenCalled();
  });
});
