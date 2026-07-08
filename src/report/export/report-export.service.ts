import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { env } from 'src/shared/env.schema';
import { PgBossService } from 'src/queue/pg-boss.service';
import { REPORT_EXPORT_QUEUE } from 'src/queue/queue.constants';
import type { ExportJobPayload } from 'src/queue/types/export-job.payload';
import { ReportExecutionService } from '../execution/report-execution.service';
import {
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { ReportJobService } from '../jobs/report-job.service';
import { ReportService } from '../report.service';
import { ReportSnapshotService } from '../report-snapshot.service';
import { buildCsvContent } from './csv-writer.util';

@Injectable()
export class ReportExportService {
  constructor(
    private readonly pgBossService: PgBossService,
    @Inject(forwardRef(() => ReportJobService))
    private readonly reportJobService: ReportJobService,
    @Inject(forwardRef(() => ReportService))
    private readonly reportService: ReportService,
    private readonly reportExecutionService: ReportExecutionService,
    @Inject(forwardRef(() => ReportSnapshotService))
    private readonly reportSnapshotService: ReportSnapshotService,
  ) {}

  async scheduleExport(
    relatorioId: number,
    userId: number,
    parametros: Record<string, unknown>,
  ): Promise<string> {
    await this.reportService.findById(relatorioId, userId);

    const payload: ExportJobPayload = {
      relatorioId,
      userId,
      parametros,
      formato: 'csv',
    };

    const jobId = await this.pgBossService.send(REPORT_EXPORT_QUEUE, payload, {
      singletonKey: `export-csv-${relatorioId}-${userId}`,
    });

    await this.reportJobService.createJob({
      id: jobId,
      relatorioId,
      userId,
      tipo: RelatorioJobTipo.EXPORT_CSV,
      parametros,
    });

    return jobId;
  }

  async generateCsvExport(jobId: string, payload: ExportJobPayload): Promise<void> {
    await this.reportJobService.markProcessing(jobId, 10);

    try {
      const relatorio = await this.reportService.findById(
        payload.relatorioId,
        payload.userId,
      );

      let colunas: string[];
      let dados: Record<string, unknown>[];

      if (
        relatorio.estado === EstadoRelatorio.OFFLINE &&
        relatorio.snapshot_valido
      ) {
        const snapshot = await this.reportSnapshotService.findSnapshot(
          payload.relatorioId,
        );

        if (!snapshot) {
          throw new Error('Snapshot não encontrado para exportação');
        }

        colunas = snapshot.colunas;
        dados = snapshot.dados as Record<string, unknown>[];
      } else {
        const result = await this.reportExecutionService.execute(
          payload.relatorioId,
          payload.parametros,
        );
        colunas = result.colunas;
        dados = result.dados;
      }

      await this.reportJobService.updateProgress(jobId, 50);

      await mkdir(env.REPORT_EXPORT_DIR, { recursive: true });

      const safeName = relatorio.nome.replace(/[^a-zA-Z0-9-_]+/g, '_');
      const fileName = `${safeName}-${payload.relatorioId}-${Date.now()}.csv`;
      const filePath = join(env.REPORT_EXPORT_DIR, fileName);
      const csvContent = buildCsvContent(colunas, dados);

      await this.reportJobService.updateProgress(jobId, 90);
      await writeFile(filePath, csvContent, 'utf8');
      await this.reportJobService.markCompleted(jobId, filePath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao exportar relatório';
      await this.reportJobService.markFailed(jobId, message);
      throw error;
    }
  }
}
