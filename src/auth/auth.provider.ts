import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthorizationGuard } from './AuthorizationGuard';

export const authProviders = [
  {
    provide: APP_GUARD,
    useClass: AuthGuard,
  },
  {
    provide: APP_GUARD,
    useClass: AuthorizationGuard,
  },
];
