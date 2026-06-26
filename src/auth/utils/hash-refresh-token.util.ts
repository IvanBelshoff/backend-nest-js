import { createHash, randomBytes } from 'crypto';
import { refreshTokenConstants } from '../constants';

export function hashRefreshToken(rawToken: string): string {
  return createHash('sha256')
    .update(`${refreshTokenConstants.pepper}:${rawToken}`)
    .digest('hex');
}

export function generateOpaqueRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}
