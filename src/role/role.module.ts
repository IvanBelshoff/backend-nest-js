import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { roleProviders } from './role.provider';
import { permissionProviders } from 'src/permission/permission.provider';

@Module({
  providers: [...roleProviders, ...permissionProviders, RoleService],
  exports: [RoleService, ...roleProviders],
})
export class RoleModule {}
