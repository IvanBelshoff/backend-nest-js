import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conexao } from 'src/database/entities/Conexoes';
import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { ConnectionModule } from 'src/connection/connection.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportSnapshotService } from './report-snapshot.service';
import { ReportExecutionService } from './execution/report-execution.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Relatorio, Usuario, Conexao]),
    ConnectionModule,
  ],
  controllers: [ReportController],
  providers: [ReportService, ReportSnapshotService, ReportExecutionService],
  exports: [ReportService],
})
export class ReportModule {}
