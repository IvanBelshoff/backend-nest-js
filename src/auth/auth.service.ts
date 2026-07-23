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
import type { UsuarioPreferenciasUi } from 'src/user/types/usuario-preferencias-ui.types';
import { resolveUsuarioPreferenciasUi } from 'src/user/usuario-preferencias-ui.util';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import type { AuditHttpContext } from 'src/audit/types/audit.types';
import { toAuditRecordMetadata } from 'src/audit/utils/audit-metadata.util';

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
  preferencias_ui: UsuarioPreferenciasUi;
} & UserRbacDto;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
  ) {}

  async signIn(
    email: string,
    pass: string,
    http?: AuditHttpContext,
  ): Promise<AuthSessionResult> {
    const user = await this.usersService.findOne(email);

    const isPasswordValid = user?.senha
      ? await bcrypt.compare(pass, user.senha)
      : false;

    if (!user || !isPasswordValid) {
      this.auditService.record({
        actor: { type: 'anonymous', email },
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
        category: 'auth',
        outcome: 'failure',
        http,
        metadata: toAuditRecordMetadata([], { attemptedEmail: email }),
      });
      throw new UnauthorizedException();
    }

    if (user.bloqueado) {
      this.auditService.record({
        actor: { type: 'anonymous', email },
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
        category: 'auth',
        outcome: 'denied',
        http,
        metadata: toAuditRecordMetadata([], { attemptedEmail: email, reason: 'blocked' }),
      });
      throw new UnauthorizedException();
    }

    const refreshToken = await this.refreshTokenService.issue(user.id);
    await this.usersService.updateUltimoLogin(user.id);

    const payload = { sub: user.id, email: user.email };
    const rbac = mapUserRbac(user);

    this.auditService.record({
      actor: { userId: Number(user.id), email: user.email, type: 'user' },
      action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
      category: 'auth',
      outcome: 'success',
      resource: { type: 'usuario', id: Number(user.id) },
      http,
    });

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
      preferencias_ui: resolveUsuarioPreferenciasUi(authUser.preferencias_ui),
    };
  }

  async logout(
    rawRefreshToken: string | undefined,
    actor?: { sub: number; email: string },
    http?: AuditHttpContext,
  ): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    await this.refreshTokenService.revoke(rawRefreshToken);

    this.auditService.record({
      actor: actor
        ? { userId: actor.sub, email: actor.email, type: 'user' }
        : { type: 'anonymous' },
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      category: 'auth',
      outcome: 'success',
      resource: actor ? { type: 'usuario', id: actor.sub } : null,
      http,
    });
  }
}
