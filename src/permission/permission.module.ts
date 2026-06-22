import { Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { permissionProviders } from './permission.provider';
import { roleProviders } from 'src/role/role.provider';

@Module({
  providers: [...permissionProviders, ...roleProviders, PermissionService],
  exports: [PermissionService, ...permissionProviders],
})
export class PermissionModule {}
