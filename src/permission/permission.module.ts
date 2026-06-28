import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionService } from './permission.service';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';

@Module({
  imports: [TypeOrmModule.forFeature([Permissao, Regra])],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
