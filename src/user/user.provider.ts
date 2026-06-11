import { DataSource } from 'typeorm';
import { Foto } from '../database/entities/Fotos';
import { Usuario } from '../database/entities/Usuarios';

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
];
