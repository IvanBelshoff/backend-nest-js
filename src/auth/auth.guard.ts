/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from 'src/shared/decorators/auth-public.decorator';
import { LIGHTWEIGHT_AUTH_KEY } from 'src/shared/decorators/lightweight-auth.decorator';
import { UsersService } from 'src/user/user.service';
import type { UserRequest } from 'src/shared/interfaces/UserRequest';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isLightweight = this.reflector.getAllAndOverride<boolean>(
      LIGHTWEIGHT_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<UserRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;

      if (isLightweight) {
        await this.usersService.assertUserActive(Number(payload.sub));
        return true;
      }

      if (payload.email && !request.authUser) {
        request.authUser = await this.usersService.findOne(payload.email);
      }

      if (!request.authUser || request.authUser.bloqueado) {
        throw new UnauthorizedException();
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException();
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
