import { SetMetadata } from '@nestjs/common';

export const AUTHORIZATION_KEY = 'authorization';

export interface AuthorizationRule {
  type: 'role' | 'permission';
  required: string[];
}

export interface AuthorizationMetadata {
  requirements: AuthorizationRule[];
}

export const Authorization = (
  type: 'role' | 'permission',
  required: string[],
) =>
  SetMetadata(AUTHORIZATION_KEY, {
    requirements: [{ type, required }],
  } satisfies AuthorizationMetadata);

export const AuthorizationAll = (...requirements: AuthorizationRule[]) =>
  SetMetadata(AUTHORIZATION_KEY, {
    requirements,
  } satisfies AuthorizationMetadata);
