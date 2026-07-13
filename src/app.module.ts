import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { UsersModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { MongodbModule } from './database/mongodb.module';
import { AuthModule } from './auth/auth.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ConnectionModule } from './connection/connection.module';
import { ReportModule } from './report/report.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AdminJobsModule } from './admin-jobs/admin-jobs.module';
import { QueueModule } from './queue/queue.module';
import { IconModule } from './icon/icon.module';
import { SystemMetricsModule } from './system-metrics/system-metrics.module';
import { SyncRolesAndPermissions } from './shared/services/SyncRolesAndPermissions';
import { DefaultUserService } from './shared/services/SeedDefaultUser';
import { SeedDashboardsService } from './shared/services/SeedDashboards';
import { SeedRelatoriosService } from './shared/services/SeedRelatorios';
import { SeedUsersService } from './shared/services/SeedUsers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permissao } from './database/entities/Permissoes';
import { Regra } from './database/entities/Regras';
import { Usuario } from './database/entities/Usuarios';
import { Dashboard } from './database/entities/Dashboards';
import { Conexao } from './database/entities/Conexoes';
import { Relatorio } from './database/entities/Relatorios';
import { env } from './shared/env.schema';

const isThrottlingEnabled = env.NODE_ENV !== 'development';

@Module({
  controllers: [AppController],
  imports: [
    ...(isThrottlingEnabled
      ? [
          ThrottlerModule.forRoot([
            { name: 'auth', ttl: 900_000, limit: 20 },
            { name: 'login', ttl: 900_000, limit: 5 },
            { name: 'default', ttl: 60_000, limit: 100 },
          ]),
        ]
      : []),
    UsersModule,
    DatabaseModule,
    MongodbModule,
    AuthModule,
    RoleModule,
    PermissionModule,
    DashboardModule,
    ConnectionModule,
    QueueModule,
    SchedulerModule,
    AdminJobsModule,
    ReportModule,
    IconModule,
    SystemMetricsModule,
    TypeOrmModule.forFeature([Permissao, Regra, Usuario, Dashboard, Conexao, Relatorio]),
  ],
  providers: [
    SyncRolesAndPermissions,
    DefaultUserService,
    SeedDashboardsService,
    SeedRelatoriosService,
    SeedUsersService,
    ...(isThrottlingEnabled
      ? [
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
          },
        ]
      : []),
  ],
})
export class AppModule {}
