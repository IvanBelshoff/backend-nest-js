import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Get,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { signinSchema, type SigninDto } from './dtos/signin.dto';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import {
  clearRefreshCookie,
  getRefreshTokenFromCookie,
  setRefreshCookie,
} from './utils/refresh-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 900_000 } })
  @Post('login')
  @ZodValidation(signinSchema)
  async signIn(
    @Body() dto: SigninDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.signIn(dto.email, dto.senha);
    setRefreshCookie(
      res,
      session.refreshToken.rawToken,
      session.refreshToken.expiresAt,
    );

    return {
      access_token: session.access_token,
      expires_in: session.expires_in,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ login: { limit: 5, ttl: 900_000 } })
  @Post('refresh')
  async refresh(
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = getRefreshTokenFromCookie(req);

    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }

    const session = await this.authService.refresh(rawRefreshToken);
    setRefreshCookie(
      res,
      session.refreshToken.rawToken,
      session.refreshToken.expiresAt,
    );

    return {
      access_token: session.access_token,
      expires_in: session.expires_in,
    };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = getRefreshTokenFromCookie(req);
    await this.authService.logout(rawRefreshToken);
    clearRefreshCookie(res);
  }

  @Get('profile')
  getProfile(@Request() req: UserRequest.UserRequest) {
    if (!req.user) {
      return null;
    }

    return req.user;
  }
}
