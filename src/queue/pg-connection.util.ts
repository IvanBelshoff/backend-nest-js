import { env } from 'src/shared/env.schema';

export function buildPgConnectionString(): string {
  const user = encodeURIComponent(env.DB_USER);
  const password = encodeURIComponent(env.DB_PASS);
  return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
}
