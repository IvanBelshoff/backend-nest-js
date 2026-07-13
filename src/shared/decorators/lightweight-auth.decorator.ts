import { SetMetadata } from '@nestjs/common';

export const LIGHTWEIGHT_AUTH_KEY = 'lightweightAuth';

export const LightweightAuth = () => SetMetadata(LIGHTWEIGHT_AUTH_KEY, true);
