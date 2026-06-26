import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RefreshTokenService } from './refresh-token.service';
import { jwtConstants } from './constants';

export interface AuthSessionResult {
  access_token: string;
  expires_in: number;
  refreshToken: {
    rawToken: string;
    expiresAt: Date;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async signIn(email: string, pass: string): Promise<AuthSessionResult> {
    const user = await this.usersService.findOne(email);

    const isPasswordValid = user?.senha
      ? await bcrypt.compare(pass, user.senha)
      : false;

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException();
    }

    if (user.bloqueado) {
      throw new UnauthorizedException();
    }

    const refreshToken = await this.refreshTokenService.issue(user.id);
    await this.usersService.updateUltimoLogin(user.id);

    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
      expires_in: jwtConstants.expiresInSeconds,
      refreshToken,
    };
  }

  async refresh(rawRefreshToken: string): Promise<AuthSessionResult> {
    const rotated = await this.refreshTokenService.rotate(rawRefreshToken);
    const user = await this.usersService.findById(rotated.usuarioId);

    if (!user || user.bloqueado) {
      await this.refreshTokenService.revoke(rotated.rawToken);
      throw new UnauthorizedException();
    }

    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
      expires_in: jwtConstants.expiresInSeconds,
      refreshToken: {
        rawToken: rotated.rawToken,
        expiresAt: rotated.expiresAt,
      },
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    await this.refreshTokenService.revoke(rawRefreshToken);
  }
}
