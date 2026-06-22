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

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const authorization =
      this.reflector.getAllAndOverride<AuthorizationMetadata>(
        AUTHORIZATION_KEY,
        [context.getHandler(), context.getClass()],
      );

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
      return this.validateRoles(user, required);
    }

    return this.validatePermissions(user, required);
  }

  private validateRoles(user: any, required: string[]): boolean {
    return true;
  }

  private validatePermissions(user: any, required: string[]): boolean {
    return true;
  }
}
