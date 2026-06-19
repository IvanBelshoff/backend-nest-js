import { DataSource } from 'typeorm';
import { Permissao } from 'src/database/entities/Permissoes';

export const permissionProviders = [
  {
    provide: 'PERMISSION_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Permissao),
    inject: ['DATA_SOURCE'],
  },
];
