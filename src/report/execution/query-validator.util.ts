import { BadRequestException } from '@nestjs/common';

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'MERGE',
  'EXEC',
  'EXECUTE',
  'CALL',
  'INTO',
];

export function assertReadOnlyQuery(sql: string): void {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    throw new BadRequestException('Query não pode ser vazia');
  }

  if (normalized.includes(';')) {
    throw new BadRequestException('Múltiplos statements não são permitidos');
  }

  const upper = normalized.toUpperCase();

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`);
    if (pattern.test(upper)) {
      throw new BadRequestException(
        `Query contém operação não permitida: ${keyword}`,
      );
    }
  }

  if (!/^\s*SELECT\b/i.test(normalized) && !/^\s*WITH\b/i.test(normalized)) {
    throw new BadRequestException('Somente queries SELECT são permitidas');
  }
}
