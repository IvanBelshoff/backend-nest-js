import { DataSource } from 'typeorm';
import { Regra } from '../database/entities/Regras';

export const roleProviders = [
  {
    provide: 'ROLE_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Regra),
    inject: ['DATA_SOURCE'],
  },
];
