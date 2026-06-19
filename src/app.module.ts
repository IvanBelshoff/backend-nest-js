import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { UsersModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';

@Module({
  controllers: [AppController],
  imports: [
    UsersModule,
    DatabaseModule,
    AuthModule,
    RoleModule,
    PermissionModule,
  ],
})
export class AppModule {}
