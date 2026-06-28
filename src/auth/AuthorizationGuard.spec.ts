import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationGuard } from './AuthorizationGuard';
import { UsersService } from 'src/user/user.service';

describe('AuthorizationGuard', () => {
  const usersService = {
    findOne: jest.fn(),
  };

  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new AuthorizationGuard(
    reflector as unknown as Reflector,
    usersService as unknown as UsersService,
  );

  const buildContext = (authUser?: {
    regra: Array<{ nome: string }>;
    permissao: Array<{ nome: string; regra: { nome: string } }>;
  }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: { email: 'user@example.com' },
          authUser,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses cached authUser without querying the database', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      requirements: [{ type: 'role', required: ['REGRA_USUARIO'] }],
    });

    await expect(
      guard.canActivate(
        buildContext({
          regra: [{ nome: 'REGRA_USUARIO' }],
          permissao: [],
        }),
      ),
    ).resolves.toBe(true);

    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('falls back to UsersService when authUser is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      requirements: [{ type: 'role', required: ['REGRA_USUARIO'] }],
    });

    usersService.findOne.mockResolvedValue({
      regra: [{ nome: 'REGRA_USUARIO' }],
      permissao: [],
    });

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(usersService.findOne).toHaveBeenCalledWith('user@example.com');
  });

  it('requires all authorization rules to pass', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      requirements: [
        { type: 'role', required: ['REGRA_DASHBOARD'] },
        { type: 'permission', required: ['PERMISSAO_CRIAR_DASHBOARD'] },
      ],
    });

    await expect(
      guard.canActivate(
        buildContext({
          regra: [{ nome: 'REGRA_DASHBOARD' }],
          permissao: [
            {
              nome: 'PERMISSAO_CRIAR_DASHBOARD',
              regra: { nome: 'REGRA_DASHBOARD' },
            },
          ],
        }),
      ),
    ).resolves.toBe(true);
  });

  it('throws when required role is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      requirements: [{ type: 'role', required: ['REGRA_ADMIN'] }],
    });

    await expect(
      guard.canActivate(
        buildContext({
          regra: [{ nome: 'REGRA_USUARIO' }],
          permissao: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
