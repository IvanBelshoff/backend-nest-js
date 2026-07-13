import { createWriteStream } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { UserNotificationService } from 'src/user-notifications/user-notification.service';
import { env } from 'src/shared/env.schema';
import { PgBossService } from 'src/queue/pg-boss.service';
import { REPORT_EXPORT_QUEUE } from 'src/queue/queue.constants';
import type { ExportJobPayload } from 'src/queue/types/export-job.payload';
import { ReportExecutionService } from '../execution/report-execution.service';
import {
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { ReportJobService } from '../jobs/report-job.service';
import { resolveJobExpireInSeconds } from '../jobs/report-job-expire.util';
import { ReportService } from '../report.service';
import { ReportSnapshotService } from '../report-snapshot.service';
import { DuckDbService } from '../duckdb/duckdb.service';
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
    private readonly duckDbService: DuckDbService,
    private readonly userNotificationService: UserNotificationService,
  ) {}

  async scheduleExport(
    relatorioId: number,
    userId: number,
    parametros: Record<string, unknown>,
  ): Promise<string> {
    const relatorio = await this.reportService.findById(relatorioId, userId);

    const payload: ExportJobPayload = {
      relatorioId,
      userId,
      parametros,
      formato: 'csv',
    };

    const jobId = await this.pgBossService.send(REPORT_EXPORT_QUEUE, payload, {
      singletonKey: `export-csv-${relatorioId}-${userId}`,
      expireInSeconds: resolveJobExpireInSeconds(relatorio.timeout_ms),
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

    let relatorio: Awaited<ReturnType<ReportService['findById']>> | null = null;

    try {
      relatorio = await this.reportService.findById(
        payload.relatorioId,
        payload.userId,
      );

      await mkdir(env.REPORT_EXPORT_DIR, { recursive: true });

      const safeName = relatorio.nome.replace(/[^a-zA-Z0-9-_]+/g, '_');
      const fileName = `${safeName}-${payload.relatorioId}-${Date.now()}.csv`;
      const filePath = join(env.REPORT_EXPORT_DIR, fileName);

      if (
        relatorio.estado === EstadoRelatorio.OFFLINE &&
        relatorio.snapshot_valido
      ) {
        const resolved = await this.reportSnapshotService.resolveSnapshotFile(
          payload.relatorioId,
        );

        if (!resolved) {
          throw new Error('Snapshot não encontrado para exportação');
        }

        await this.reportJobService.updateProgress(jobId, 50);

        const tempCsvPath = `${filePath}.tmp`;
        await this.duckDbService.copyToCsv(resolved.readUri, tempCsvPath);
        await this.prependBomAndFinalize(tempCsvPath, filePath);

        await this.reportJobService.updateProgress(jobId, 90);
        await this.reportJobService.markCompleted(jobId, filePath);
        await this.notifyJobCompletion(jobId, relatorio);
        return;
      }

      const result = await this.reportExecutionService.execute(
        payload.relatorioId,
        payload.parametros,
      );

      await this.reportJobService.updateProgress(jobId, 50);

      const csvContent = buildCsvContent(result.colunas, result.dados);

      await this.reportJobService.updateProgress(jobId, 90);
      await writeFile(filePath, csvContent, 'utf8');
      await this.reportJobService.markCompleted(jobId, filePath);
      await this.notifyJobCompletion(jobId, relatorio);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao exportar relatório';
      await this.reportJobService.markFailed(jobId, message);
      await this.notifyJobCompletion(jobId, relatorio);
      throw error;
    }
  }

  private async notifyJobCompletion(
    jobId: string,
    relatorio: Pick<Relatorio, 'id' | 'nome'> | null,
  ): Promise<void> {
    const job = await this.reportJobService.findJobEntity(jobId);

    if (!job) {
      return;
    }

    await this.userNotificationService.createFromJob(
      job,
      relatorio ?? {
        id: Number(job.relatorioId),
        nome: `Relatório #${job.relatorioId}`,
      },
    );
  }

  /** Adiciona BOM UTF-8 ao CSV gerado pelo DuckDB via streaming (sem carregar tudo em RAM). */
  private async prependBomAndFinalize(
    tempPath: string,
    finalPath: string,
  ): Promise<void> {
    const { unlink } = await import('node:fs/promises');

    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(tempPath);
      const writeStream = createWriteStream(finalPath, { encoding: 'utf8' });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      writeStream.write('\uFEFF', (error) => {
        if (error) {
          reject(error);
          return;
        }
        readStream.pipe(writeStream);
      });
    });

    await unlink(tempPath);
  }
}
