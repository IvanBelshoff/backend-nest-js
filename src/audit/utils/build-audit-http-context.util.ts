import type { Request } from 'express';
import type { AuditHttpContext } from '../types/audit.types';

export function buildAuditHttpContext(req?: Request): AuditHttpContext | undefined {
  if (!req) {
    return undefined;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.ip ?? req.socket?.remoteAddress;

  return {
    method: req.method,
    path: req.originalUrl ?? req.url,
    ip: ip ?? undefined,
    user_agent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : undefined,
  };
}
