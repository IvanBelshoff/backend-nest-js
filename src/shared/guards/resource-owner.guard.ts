import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RESOURCE_OWNER_KEY,
  ResourceOwnerMetadata,
} from '../decorators/resource-owner.decorator';
import { ADMIN_ROLE_NAME } from '../services/RolePermissionPolicy';
import { UsersService } from 'src/user/user.service';
import type { UserRequest } from '../interfaces/UserRequest';

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<ResourceOwnerMetadata>(
      RESOURCE_OWNER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<UserRequest>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    const resourceId = Number(request.params[metadata.param]);

    if (Number(request.user.sub) === resourceId) {
      return true;
    }

    const authUser =
      request.authUser ??
      (await this.usersService.findOne(request.user.email));

    if (!authUser) {
      throw new ForbiddenException('Acesso negado ao recurso');
    }

    const isAdmin = authUser.regra?.some(
      (regra) => regra.nome === ADMIN_ROLE_NAME,
    );

    if (isAdmin) {
      return true;
    }

    const allowedRoles = metadata.roles ?? [];

    if (allowedRoles.length > 0) {
      const hasRole = authUser.regra?.some((regra) =>
        allowedRoles.includes(regra.nome),
      );

      if (hasRole) {
        return true;
      }
    }

    throw new ForbiddenException('Acesso negado ao recurso');
  }
}
