import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an access token when the password matches the stored hash', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        senha: passwordHash,
      }),
    };
    const service = new AuthService(usersService as any, jwtService as any);

    await expect(
      service.signIn('ivan@example.com', 'senha-segura'),
    ).resolves.toEqual({
      access_token: 'jwt-token',
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'ivan@example.com',
    });
  });

  it('throws UnauthorizedException when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('senha-segura', 10);
    const usersService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'ivan@example.com',
        senha: passwordHash,
      }),
    };
    const service = new AuthService(usersService as any, jwtService as any);

    await expect(
      service.signIn('ivan@example.com', 'senha-incorreta'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
