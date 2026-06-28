import { DataSource } from 'typeorm';
import { Usuario } from '../database/entities/Usuarios';
import { Foto } from '../database/entities/Fotos';
import { Regra } from '../database/entities/Regras';
import { Permissao } from '../database/entities/Permissoes';
import { Dashboard } from '../database/entities/Dashboards';

export const userProviders = [
  {
    provide: 'USER_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Usuario),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'FOTO_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Foto),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'REGRA_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Regra),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'PERMISSAO_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Permissao),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'DASHBOARD_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Dashboard),
    inject: ['DATA_SOURCE'],
  },
];
