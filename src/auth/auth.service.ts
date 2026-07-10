import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RefreshTokenService } from './refresh-token.service';
import { jwtConstants } from './constants';
import {
  mapUserRbac,
  type UserRbacDto,
} from 'src/shared/services/map-user-rbac';
import type { Usuario } from 'src/database/entities/Usuarios';

export interface AuthSessionResult {
  access_token: string;
  expires_in: number;
  regras: string[];
  permissoes: string[];
  refreshToken: {
    rawToken: string;
    expiresAt: Date;
  };
}

export type AuthProfileResult = {
  sub: number;
  email: string;
  iat: number;
  exp: number;
} & UserRbacDto;

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
    const rbac = mapUserRbac(user);

    return {
      access_token: await this.jwtService.signAsync(payload),
      expires_in: jwtConstants.expiresInSeconds,
      regras: rbac.regras,
      permissoes: rbac.permissoes,
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
      regras: [],
      permissoes: [],
      refreshToken: {
        rawToken: rotated.rawToken,
        expiresAt: rotated.expiresAt,
      },
    };
  }

  buildProfile(
    jwtPayload: { sub: number; email: string; iat: number; exp: number },
    authUser: Usuario,
  ): AuthProfileResult {
    const rbac = mapUserRbac(authUser);

    return {
      sub: jwtPayload.sub,
      email: jwtPayload.email,
      iat: jwtPayload.iat,
      exp: jwtPayload.exp,
      regras: rbac.regras,
      permissoes: rbac.permissoes,
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    await this.refreshTokenService.revoke(rawRefreshToken);
  }
}
