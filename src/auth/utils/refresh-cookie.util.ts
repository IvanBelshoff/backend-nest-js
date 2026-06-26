import type { CookieOptions, Request, Response } from 'express';
import { cookieConstants, refreshTokenConstants } from '../constants';

function getCookieOptions(expiresAt?: Date): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: cookieConstants.secure,
    sameSite: cookieConstants.sameSite,
    path: refreshTokenConstants.cookiePath,
  };

  if (expiresAt) {
    options.expires = expiresAt;
  }

  return options;
}

export function setRefreshCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
): void {
  res.cookie(
    refreshTokenConstants.cookieName,
    rawToken,
    getCookieOptions(expiresAt),
  );
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(refreshTokenConstants.cookieName, getCookieOptions());
}

export function getRefreshTokenFromCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[refreshTokenConstants.cookieName];
}
