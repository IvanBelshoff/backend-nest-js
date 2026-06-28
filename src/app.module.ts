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
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permissao } from './database/entities/Permissoes';
import { Regra } from './database/entities/Regras';
import { Usuario } from './database/entities/Usuarios';

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
    TypeOrmModule.forFeature([Permissao, Regra, Usuario]),
  ],
  providers: [
    SyncRolesAndPermissions,
    DefaultUserService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
