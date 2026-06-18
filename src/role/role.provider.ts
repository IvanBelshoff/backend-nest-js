import { DataSource } from 'typeorm';
import { Regra } from '../database/entities/Regras';
import { Permissao } from 'src/database/entities/Permissoes';

export const roleProviders = [
  {
    provide: 'ROLE_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Regra),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'PERMISSION_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Permissao),
    inject: ['DATA_SOURCE'],
  },
];
