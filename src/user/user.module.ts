import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { Usuario } from '../database/entities/Usuarios';
import { Foto } from '../database/entities/Fotos';
import { Regra } from '../database/entities/Regras';
import { Permissao } from '../database/entities/Permissoes';
import { Dashboard } from '../database/entities/Dashboards';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      Foto,
      Regra,
      Permissao,
      Dashboard,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
