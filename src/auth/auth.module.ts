
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../user/user.module';
import { jwtConstants } from './constants';
import { authProviders } from './auth.provider';
import { RefreshToken } from 'src/database/entities/RefreshTokens';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.expiresIn },
    }),
  ],
  providers: [...authProviders, AuthService, RefreshTokenService],
  controllers: [AuthController],
})
export class AuthModule {}
