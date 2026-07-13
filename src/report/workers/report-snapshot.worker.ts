import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { PgBossService } from 'src/queue/pg-boss.service';
import { REPORT_SNAPSHOT_QUEUE } from 'src/queue/queue.constants';
import type { SnapshotJobPayload } from 'src/queue/types/snapshot-job.payload';
import { ReportJobService } from '../jobs/report-job.service';
import { ReportSnapshotService } from '../report-snapshot.service';
import { UserNotificationService } from 'src/user-notifications/user-notification.service';

@Injectable()
export class ReportSnapshotWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportSnapshotWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly reportJobService: ReportJobService,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    private readonly userNotificationService: UserNotificationService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    this.pgBossService.registerWorkHandler(
      REPORT_SNAPSHOT_QUEUE,
      async (jobs) => {
        for (const job of jobs) {
          const payload = job.data as SnapshotJobPayload;
          await this.processJob(job.id, payload);
        }
      },
    );
  }

  private async processJob(
    jobId: string,
    payload: SnapshotJobPayload,
  ): Promise<void> {
    await this.reportJobService.markProcessing(jobId, 10);

    await this.reportSnapshotService.generateSnapshot(
      payload.relatorioId,
      payload.userId,
      payload.parametrosSnapshot,
    );

    const relatorio = await this.relatorioRepository.findOne({
      where: { id: payload.relatorioId },
    });

    if (!relatorio) {
      await this.reportJobService.markFailed(jobId, 'Relatório não encontrado');
      await this.notifyJobCompletion(jobId, null);
      return;
    }

    if (
      relatorio.estado === EstadoRelatorio.OFFLINE &&
      relatorio.snapshot_valido
    ) {
      await this.reportJobService.markCompleted(jobId);
      await this.notifyJobCompletion(jobId, relatorio);
      return;
    }

    await this.reportJobService.markFailed(
      jobId,
      relatorio.erro_ultima_geracao ?? 'Falha ao gerar snapshot',
    );
    await this.notifyJobCompletion(jobId, relatorio);
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
}
