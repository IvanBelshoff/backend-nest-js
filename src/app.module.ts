import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { UsersModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IconModule } from './icon/icon.module';
import { SyncRolesAndPermissions } from './shared/services/SyncRolesAndPermissions';
import { DefaultUserService } from './shared/services/SeedDefaultUser';
import { SeedDashboardsService } from './shared/services/SeedDashboards';
import { SeedUsersService } from './shared/services/SeedUsers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permissao } from './database/entities/Permissoes';
import { Regra } from './database/entities/Regras';
import { Usuario } from './database/entities/Usuarios';
import { Dashboard } from './database/entities/Dashboards';

@Module({
  controllers: [AppController],
  imports: [
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 900_000, limit: 20 },
      { name: 'login', ttl: 900_000, limit: 5 },
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),
    UsersModule,
    DatabaseModule,
    AuthModule,
    RoleModule,
    PermissionModule,
    DashboardModule,
    IconModule,
    TypeOrmModule.forFeature([Permissao, Regra, Usuario, Dashboard]),
  ],
  providers: [
    SyncRolesAndPermissions,
    DefaultUserService,
    SeedDashboardsService,
    SeedUsersService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
