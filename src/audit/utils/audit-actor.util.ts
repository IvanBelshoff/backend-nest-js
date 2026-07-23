import type { AuditActor } from '../types/audit.types';

export function toAuditActor(requester: {
  sub: number;
  email: string;
}): AuditActor {
  return {
    userId: requester.sub,
    email: requester.email,
    type: 'user',
  };
}

export function toResourceId(id: number | bigint | string): number | string {
  if (typeof id === 'bigint') {
    return Number(id);
  }

  return id;
}
