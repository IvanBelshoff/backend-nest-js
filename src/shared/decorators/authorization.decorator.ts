import { SetMetadata } from '@nestjs/common';

export const AUTHORIZATION_KEY = 'authorization';

export interface AuthorizationMetadata {
  type: 'role' | 'permission';
  required: string[];
}

export const Authorization = (
  type: 'role' | 'permission',
  required: string[],
) =>
  SetMetadata(AUTHORIZATION_KEY, {
    type,
    required,
  } satisfies AuthorizationMetadata);