import { Module } from '@nestjs/common';
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

@Module({
  controllers: [AppController],
  imports: [
    UsersModule,
    DatabaseModule,
    AuthModule,
    RoleModule,
    PermissionModule,
    DashboardModule,
    IconModule,
  ],
  providers: [SyncRolesAndPermissions, DefaultUserService],
})
export class AppModule {}
