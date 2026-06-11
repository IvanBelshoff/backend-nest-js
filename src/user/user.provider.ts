import { DataSource } from 'typeorm';
import { Usuario } from '../database/entities/Usuarios';

export const userProviders = [
  {
    provide: 'USER_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Usuario),
    inject: ['DATA_SOURCE'],
  },
];
