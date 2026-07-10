import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { UsersService } from 'src/user/user.service';

describe('AuthGuard', () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  };

  const usersService = {
    findOne: jest.fn(),
  };

  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const guard = new AuthGuard(
    jwtService as unknown as JwtService,
    reflector as unknown as Reflector,
    usersService as unknown as UsersService,
  );

  const buildContext = (authorization?: string) => {
    const request = {
      headers: authorization ? { authorization } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
      request,
    } as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('allows an active authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'user@example.com',
    });
    usersService.findOne.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      bloqueado: false,
    });

    const context = buildContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.request.user).toEqual({
      sub: 1,
      email: 'user@example.com',
    });
    expect(context.request.authUser).toEqual(
      expect.objectContaining({ bloqueado: false }),
    );
  });

  it('rejects blocked users with UnauthorizedException', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'user@example.com',
    });
    usersService.findOne.mockResolvedValue({
      id: 1,
      email: 'user@example.com',
      bloqueado: true,
    });

    await expect(
      guard.canActivate(buildContext('Bearer valid-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the authenticated user no longer exists', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 1,
      email: 'missing@example.com',
    });
    usersService.findOne.mockResolvedValue(undefined);

    await expect(
      guard.canActivate(buildContext('Bearer valid-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid or expired tokens', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await expect(
      guard.canActivate(buildContext('Bearer invalid-token')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects protected routes without a bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
