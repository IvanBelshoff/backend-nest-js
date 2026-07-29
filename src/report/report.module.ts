import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conexao } from 'src/database/entities/Conexoes';
import { Relatorio } from 'src/database/entities/Relatorios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';
import { Usuario } from 'src/database/entities/Usuarios';
import { ConnectionModule } from 'src/connection/connection.module';
import { QueueModule } from 'src/queue/queue.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';
import { UserNotificationsModule } from 'src/user-notifications/user-notifications.module';
import { ReportSnapshotRefreshHandler } from 'src/scheduler/handlers/report-snapshot-refresh.handler';
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
import { DuckDbService } from './duckdb/duckdb.service';
import { SnapshotQueryService } from './snapshot-query.service';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';
import { createStorageProvider } from './storage/storage-provider.factory';
import { SnapshotCleanupService } from './storage/snapshot-cleanup.service';
import { UsuarioRelatorioAccessService } from './usuario-relatorio-access.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Relatorio, Usuario, UsuarioRelatorio, Conexao, RelatorioJob]),
    ConnectionModule,
    QueueModule,
    SchedulerModule,
    forwardRef(() => UserNotificationsModule),
  ],
  controllers: [ReportController, ReportJobController],
  providers: [
    ReportService,
    UsuarioRelatorioAccessService,
    ReportSnapshotService,
    ReportExecutionService,
    ReportJobService,
    ReportExportService,
    ReportSnapshotWorker,
    ReportExportWorker,
    ReportSnapshotRefreshHandler,
    DuckDbService,
    SnapshotQueryService,
    SnapshotCleanupService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: createStorageProvider,
    },
  ],
  exports: [
    ReportService,
    ReportJobService,
    ReportExecutionService,
    ReportSnapshotService,
    SnapshotQueryService,
    DuckDbService,
    UsuarioRelatorioAccessService,
  ],
})
export class ReportModule {}
