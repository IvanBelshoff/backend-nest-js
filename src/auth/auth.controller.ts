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

import {

  ApiBearerAuth,

  ApiBody,

  ApiNoContentResponse,

  ApiOkResponse,

  ApiOperation,

  ApiTags,

  ApiUnauthorizedResponse,

} from '@nestjs/swagger';

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

@ApiTags('auth')

export class AuthController {

  constructor(private readonly authService: AuthService) {}



  @Public()

  @HttpCode(HttpStatus.OK)

  @Throttle({ login: { limit: 5, ttl: 900_000 } })

  @Post('login')

  @ApiOperation({ summary: 'Login com email e senha; define cookie de refresh' })

  @ApiBody({

    schema: {

      example: { email: 'admin@silexcode.com', senha: 'Admin123' },

    },

  })

  @ApiOkResponse({

    schema: {

      example: {

        access_token: 'jwt...',

        expires_in: 3600,

        regras: ['REGRA_ADMIN'],

        permissoes: [],

      },

    },

  })

  @ApiUnauthorizedResponse()

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

      regras: session.regras,

      permissoes: session.permissoes,

    };

  }



  @Public()

  @HttpCode(HttpStatus.OK)

  @Throttle({ login: { limit: 5, ttl: 900_000 } })

  @Post('refresh')

  @ApiOperation({ summary: 'Renova access token via cookie refresh_token' })

  @ApiOkResponse({

    schema: {

      example: { access_token: 'jwt...', expires_in: 3600 },

    },

  })

  @ApiUnauthorizedResponse()

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

  @ApiOperation({ summary: 'Revoga refresh token e limpa cookie' })

  @ApiNoContentResponse()

  async logout(

    @Request() req: UserRequest.UserRequest,

    @Res({ passthrough: true }) res: Response,

  ) {

    const rawRefreshToken = getRefreshTokenFromCookie(req);

    await this.authService.logout(rawRefreshToken);

    clearRefreshCookie(res);

  }



  @Get('profile')

  @ApiBearerAuth('access-token')

  @ApiOperation({ summary: 'Retorna perfil do usuário autenticado com regras e permissões' })

  @ApiOkResponse({

    schema: {

      example: {

        sub: 1,

        email: 'admin@silexcode.com',

        iat: 1710000000,

        exp: 1710001200,

        regras: ['REGRA_ADMIN'],

        permissoes: [],

        preferencias_ui: {

          version: 1,

          theme: 'system',

          accentColor: '#0078D4',

          notification: {

            style: 'circularProgress',

            placement: 'bottom-right',

          },

          language: 'pt-BR',

        },

      },

    },

  })

  getProfile(@Request() req: UserRequest.UserRequest) {

    if (!req.user || !req.authUser) {

      return null;

    }



    return this.authService.buildProfile(req.user, req.authUser);

  }

}


