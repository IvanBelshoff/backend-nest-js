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

    console.log('Authorization metadata:', authorization);

    if (!authorization) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    const { type, required } = authorization;

    if (type === 'role') {
      return await this.validateRoles(user, required);
    }

    return this.validatePermissions(user, required);
  }

  private async validateRoles(user: any, required: string[]): Promise<boolean> {
    const userFound = await this.usersService.findOne(user?.email || '');

    const userRoles = userFound?.regra.map((regra) => regra.nome);

    const isAdmin = userFound?.regra.some(
      (regra) => regra.nome === 'REGRA_ADMIN',
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
    user: any,
    required: string[],
  ): Promise<boolean> {
    const userFound = await this.usersService.findOne(user?.email || '');

    const isAdmin = userFound?.regra.some(
      (regra) => regra.nome === 'REGRA_ADMIN',
    );

    if (isAdmin) {
      return true;
    }

    const userPermissions = userFound?.permissao.map(
      (permissao) => permissao.nome,
    );

    const hasRequiredPermission = userPermissions?.some((permission) =>
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
