import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { roleProviders } from './role.provider';

@Module({
  providers: [...roleProviders, RoleService],
  exports: [RoleService],
})
export class RoleModule {}
