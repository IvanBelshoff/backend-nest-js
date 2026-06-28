import { env } from '../shared/env.schema';
import { Dashboard } from './entities/Dashboards';
import { Foto } from './entities/Fotos';
import { Permissao } from './entities/Permissoes';
import { RefreshToken } from './entities/RefreshTokens';
import { Regra } from './entities/Regras';
import { Usuario } from './entities/Usuarios';

export const entities = [
  Usuario,
  Foto,
  Regra,
  Permissao,
  Dashboard,
  RefreshToken,
];

export function getTypeOrmConfig() {
  return {
    type: 'postgres' as const,
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    entities,
    synchronize: false,
    extra: {
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30000,
    },
  };
}
