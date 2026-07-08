import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conexao } from 'src/database/entities/Conexoes';
import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { ConnectionModule } from 'src/connection/connection.module';
import { QueueModule } from 'src/queue/queue.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { ReportSnapshotService } from './report-snapshot.service';
import { ReportExecutionService } from './execution/report-execution.service';
import { RelatorioJob } from 'src/database/entities/RelatorioJobs';
import { ReportJobController } from './jobs/report-job.controller';
import { ReportJobService } from './jobs/report-job.service';
import { ReportExportService } from './export/report-export.service';
import { ReportSnapshotWorker } from './workers/report-snapshot.worker';
import { ReportExportWorker } from './workers/report-export.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([Relatorio, Usuario, Conexao, RelatorioJob]),
    ConnectionModule,
    QueueModule,
  ],
  controllers: [ReportController, ReportJobController],
  providers: [
    ReportService,
    ReportSnapshotService,
    ReportExecutionService,
    ReportJobService,
    ReportExportService,
    ReportSnapshotWorker,
    ReportExportWorker,
  ],
  exports: [ReportService],
})
export class ReportModule {}
