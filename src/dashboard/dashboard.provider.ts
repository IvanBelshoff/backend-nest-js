import { DataSource } from 'typeorm';
import { Dashboard } from 'src/database/entities/Dashboards';
import { Usuario } from 'src/database/entities/Usuarios';

export const dashboardProviders = [
  {
    provide: 'DASHBOARD_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Dashboard),
    inject: ['DATA_SOURCE'],
  },
  {
    provide: 'USER_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Usuario),
    inject: ['DATA_SOURCE'],
  },
];
