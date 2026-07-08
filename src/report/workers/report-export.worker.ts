import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PgBossService } from 'src/queue/pg-boss.service';
import { REPORT_EXPORT_QUEUE } from 'src/queue/queue.constants';
import type { ExportJobPayload } from 'src/queue/types/export-job.payload';
import { ReportExportService } from '../export/report-export.service';

@Injectable()
export class ReportExportWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportExportWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly reportExportService: ReportExportService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    this.pgBossService.registerWorkHandler(REPORT_EXPORT_QUEUE, async (jobs) => {
      for (const job of jobs) {
        const payload = job.data as ExportJobPayload;
        try {
          await this.reportExportService.generateCsvExport(job.id, payload);
        } catch (error) {
          this.logger.error(
            `Falha no export job ${job.id}: ${
              error instanceof Error ? error.message : 'erro desconhecido'
            }`,
          );
          throw error;
        }
      }
    });
  }
}
