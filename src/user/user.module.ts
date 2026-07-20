import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { Usuario } from '../database/entities/Usuarios';
import { Foto } from '../database/entities/Fotos';
import { Regra } from '../database/entities/Regras';
import { Permissao } from '../database/entities/Permissoes';
import { Dashboard } from '../database/entities/Dashboards';
import { Relatorio } from '../database/entities/Relatorios';
import { AuthModule } from '../auth/auth.module';
import { ReportModule } from '../report/report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      Foto,
      Regra,
      Permissao,
      Dashboard,
      Relatorio,
    ]),
    forwardRef(() => AuthModule),
    ReportModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
