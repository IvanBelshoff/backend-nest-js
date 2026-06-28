import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_KEY,
  AuthorizationMetadata,
} from 'src/shared/decorators/authorization.decorator';
import { UsersService } from 'src/user/user.service';
import {
  ADMIN_ROLE_NAME,
  filterCompatiblePermissions,
  findIncompatiblePermissions,
} from 'src/shared/services/RolePermissionPolicy';
import { logger } from 'src/shared/services/Logger';
import type { UserRequest } from 'src/shared/interfaces/UserRequest';
import type { Usuario } from 'src/database/entities/Usuarios';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authorization =
      this.reflector.getAllAndOverride<AuthorizationMetadata>(
        AUTHORIZATION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!authorization?.requirements?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<UserRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    for (const requirement of authorization.requirements) {
      const allowed =
        requirement.type === 'role'
          ? await this.validateRoles(
              user.email,
              requirement.required,
              request.authUser,
            )
          : await this.validatePermissions(
              user.email,
              requirement.required,
              request.authUser,
            );

      if (!allowed) {
        return false;
      }
    }

    return true;
  }

  private async resolveAuthUser(
    email: string,
    cached?: Usuario,
  ): Promise<Usuario | undefined> {
    if (cached) {
      return cached;
    }

    return this.usersService.findOne(email);
  }

  private async validateRoles(
    email: string,
    required: string[],
    cached?: Usuario,
  ): Promise<boolean> {
    const userFound = await this.resolveAuthUser(email, cached);

    const userRoles = userFound?.regra.map((regra) => regra.nome);

    const isAdmin = userFound?.regra.some(
      (regra) => regra.nome === ADMIN_ROLE_NAME,
    );

    if (isAdmin) {
      return true;
    }

    const hasRequiredRole = userRoles?.some((role) =>
      required.includes(String(role)),
    );

    if (hasRequiredRole) {
      return true;
    }

    throw new ForbiddenException(
      `User does not have the required role(s): ${required.join(', ')}`,
    );
  }

  private async validatePermissions(
    email: string,
    required: string[],
    cached?: Usuario,
  ): Promise<boolean> {
    const userFound = await this.resolveAuthUser(email, cached);

    const isAdmin = userFound?.regra.some(
      (regra) => regra.nome === ADMIN_ROLE_NAME,
    );

    if (isAdmin) {
      return true;
    }

    const regras = userFound?.regra ?? [];
    const permissoes = userFound?.permissao ?? [];

    const incompatible = findIncompatiblePermissions(regras, permissoes);

    if (incompatible.length > 0) {
      logger.warn('User has permissions incompatible with assigned roles', {
        email,
        incompatible,
      });
    }

    const compatiblePermissions = filterCompatiblePermissions(regras, permissoes);
    const userPermissions = compatiblePermissions.map(
      (permissao) => permissao.nome,
    );

    const hasRequiredPermission = userPermissions.some((permission) =>
      required.includes(String(permission)),
    );

    if (hasRequiredPermission) {
      return true;
    }

    throw new ForbiddenException(
      `User does not have the required permission(s): ${required.join(', ')}`,
    );
  }
}
