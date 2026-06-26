import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuthGuard } from './auth.guard';
import { AuthorizationGuard } from './AuthorizationGuard';
import { RefreshToken } from 'src/database/entities/RefreshTokens';

export const authProviders = [
  {
    provide: APP_GUARD,
    useClass: AuthGuard,
  },
  {
    provide: APP_GUARD,
    useClass: AuthorizationGuard,
  },
  {
    provide: 'REFRESH_TOKEN_REPOSITORY',
    useFactory: (dataSource: DataSource) =>
      dataSource.getRepository(RefreshToken),
    inject: ['DATA_SOURCE'],
  },
];
