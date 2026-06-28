import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthorizationGuard } from './AuthorizationGuard';
import { ResourceOwnerGuard } from 'src/shared/guards/resource-owner.guard';

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
    provide: APP_GUARD,
    useClass: ResourceOwnerGuard,
  },
];
