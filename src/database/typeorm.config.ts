import { env } from '../shared/env.schema';
import { Conexao } from './entities/Conexoes';
import { Dashboard } from './entities/Dashboards';
import { Foto } from './entities/Fotos';
import { Permissao } from './entities/Permissoes';
import { RefreshToken } from './entities/RefreshTokens';
import { Regra } from './entities/Regras';
import { Relatorio } from './entities/Relatorios';
import { RelatorioJob } from './entities/RelatorioJobs';
import { Agendamento } from '../scheduler/entities/Agendamento';
import { AgendamentoVinculo } from '../scheduler/entities/AgendamentoVinculo';
import { AgendamentoExecucao } from '../scheduler/entities/AgendamentoExecucao';
import { UserNotification } from './entities/UserNotification';
import { Usuario } from './entities/Usuarios';

export const entities = [
  Usuario,
  Foto,
  Regra,
  Permissao,
  Dashboard,
  Conexao,
  Relatorio,
  RelatorioJob,
  Agendamento,
  AgendamentoVinculo,
  AgendamentoExecucao,
  RefreshToken,
  UserNotification,
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
