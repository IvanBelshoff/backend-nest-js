import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { jwtConstants } from './constants';

describe('AuthService', () => {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
  };

  const refreshTokenService = {
    issue: jest.fn().mockResolvedValue({
      rawToken: 'refresh-raw',
      expiresAt: new Date('2030-01-01'),
    }),
    rotate: jest.fn().mockResolvedValue({
      usuarioId: 1,
      rawToken: 'new-refresh-raw',
      expiresAt: new Date('2030-01-01'),
    }),
    revoke: jest.fn().mockResolvedValue(undefined),
  };

  const auditService = {
    record: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tokens when the password matches the stored hash', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        senha: passwordHash,
        bloqueado: false,
      }),
      updateUltimoLogin: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await expect(
      service.signIn('ivan@example.com', 'senha-segura'),
    ).resolves.toEqual({
      access_token: 'jwt-token',
      expires_in: jwtConstants.expiresInSeconds,
      regras: [],
      permissoes: [],
      refreshToken: {
        rawToken: 'refresh-raw',
        expiresAt: new Date('2030-01-01'),
      },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'ivan@example.com',
    });
    expect(refreshTokenService.issue).toHaveBeenCalledWith(1);
    expect(usersService.updateUltimoLogin).toHaveBeenCalledWith(1);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.success' }),
    );
  });

  it('throws UnauthorizedException when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        senha: passwordHash,
        bloqueado: false,
      }),
      updateUltimoLogin: jest.fn(),
    };
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await expect(
      service.signIn('ivan@example.com', 'senha-incorreta'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.failure' }),
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(refreshTokenService.issue).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the user is blocked', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        senha: passwordHash,
        bloqueado: true,
      }),
      updateUltimoLogin: jest.fn(),
    };
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await expect(
      service.signIn('ivan@example.com', 'senha-segura'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenService.issue).not.toHaveBeenCalled();
  });

  it('rotates refresh token and returns a new access token', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        bloqueado: false,
      }),
    };
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await expect(service.refresh('old-refresh-token')).resolves.toEqual({
      access_token: 'jwt-token',
      expires_in: jwtConstants.expiresInSeconds,
      regras: [],
      permissoes: [],
      refreshToken: {
        rawToken: 'new-refresh-raw',
        expiresAt: new Date('2030-01-01'),
      },
    });
    expect(refreshTokenService.rotate).toHaveBeenCalledWith('old-refresh-token');
  });

  it('revokes the new refresh token when the user is blocked during refresh', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        bloqueado: true,
      }),
    };
    const service = new AuthService(
      usersService as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshTokenService.revoke).toHaveBeenCalledWith('new-refresh-raw');
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('delegates logout to refresh token service', async () => {
    const service = new AuthService(
      {} as any,
      jwtService as any,
      refreshTokenService as any,
      auditService as any,
    );

    await service.logout('refresh-token');
    expect(refreshTokenService.revoke).toHaveBeenCalledWith('refresh-token');
  });
});
