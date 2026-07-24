import { env } from 'src/shared/env.schema';

export const jwtConstants = {
  secret: env.JWT_SECRET,
  expiresIn: '20m' as const,
  expiresInSeconds: 20 * 60,
};

export const refreshTokenConstants = {
  pepper: env.REFRESH_TOKEN_PEPPER,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  cookieName: 'refresh_token',
  cookiePath: '/auth',
};

export const cookieConstants = {
  secure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  sameSite: env.COOKIE_SAME_SITE,
};
