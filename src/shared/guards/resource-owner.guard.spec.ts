import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ResourceOwnerGuard } from './resource-owner.guard';
import { RESOURCE_OWNER_KEY } from '../decorators/resource-owner.decorator';
import { UsersService } from 'src/user/user.service';

describe('ResourceOwnerGuard', () => {
  const usersService = {
    findOne: jest.fn(),
  };

  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new ResourceOwnerGuard(
    reflector as unknown as Reflector,
    usersService as unknown as UsersService,
  );

  const buildContext = (params: Record<string, string>, user?: { sub: number; email: string }) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params,
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows access when metadata is absent', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext({ id: '1' }))).resolves.toBe(
      true,
    );
  });

  it('allows self access without loading user from database', async () => {
    reflector.getAllAndOverride.mockReturnValue({ param: 'id', roles: [] });

    await expect(
      guard.canActivate(
        buildContext({ id: '42' }, { sub: 42, email: 'self@example.com' }),
      ),
    ).resolves.toBe(true);

    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('allows admin access to another user resource', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      param: 'id',
      roles: [],
    });

    usersService.findOne.mockResolvedValue({
      regra: [{ nome: 'REGRA_ADMIN' }],
    });

    await expect(
      guard.canActivate(
        buildContext({ id: '99' }, { sub: 1, email: 'admin@example.com' }),
      ),
    ).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      RESOURCE_OWNER_KEY,
      expect.any(Array),
    );
  });

  it('allows role-based access for listed roles', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      param: 'id',
      roles: ['REGRA_USUARIO'],
    });

    usersService.findOne.mockResolvedValue({
      regra: [{ nome: 'REGRA_USUARIO' }],
    });

    await expect(
      guard.canActivate(
        buildContext({ id: '99' }, { sub: 1, email: 'user@example.com' }),
      ),
    ).resolves.toBe(true);
  });

  it('denies access when user is neither self, admin nor allowed role', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      param: 'id',
      roles: ['REGRA_USUARIO'],
    });

    usersService.findOne.mockResolvedValue({
      regra: [{ nome: 'REGRA_DASHBOARD' }],
    });

    await expect(
      guard.canActivate(
        buildContext({ id: '99' }, { sub: 1, email: 'user@example.com' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
