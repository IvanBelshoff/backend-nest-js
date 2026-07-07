import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { Regra } from '../database/entities/Regras';
import { Permissao } from '../database/entities/Permissoes';

@Module({
  imports: [TypeOrmModule.forFeature([Regra, Permissao])],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
