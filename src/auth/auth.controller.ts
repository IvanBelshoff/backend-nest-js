import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { signinSchema, type SigninDto } from './dtos/signin.dto';
import { AuthGuard } from './auth.guard';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { Public } from 'src/shared/decorators/public';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ZodValidation(signinSchema)
  signIn(@Body() dto: SigninDto) {
    return this.authService.signIn(dto.email, dto.senha);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req: UserRequest.UserRequest) {
    if (!req.user) {
      return null;
    }

    return req.user;
  }
}
