import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { JobWithMetadata } from 'pg-boss';
import { Repository } from 'typeorm';
import { PgBossService } from 'src/queue/pg-boss.service';
import {
  REPORT_EXPORT_QUEUE,
  REPORT_SNAPSHOT_QUEUE,
} from 'src/queue/queue.constants';
import {
  RelatorioJob,
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { ReportService } from '../report.service';

export interface JobStatusResponse {
  jobId: string;
  tipo: RelatorioJobTipo;
  status: RelatorioJobStatus;
  progress: number;
  relatorioId: number;
  errorMessage: string | null;
  downloadAvailable: boolean;
  createdAt: Date;
  completedAt: Date | null;
}

@Injectable()
export class ReportJobService {
  constructor(
    @InjectRepository(RelatorioJob)
    private readonly jobRepository: Repository<RelatorioJob>,
    private readonly pgBossService: PgBossService,
    @Inject(forwardRef(() => ReportService))
    private readonly reportService: ReportService,
  ) {}

  async createJob(input: {
    id: string;
    relatorioId: number;
    userId: number;
    tipo: RelatorioJobTipo;
    parametros?: Record<string, unknown>;
  }): Promise<RelatorioJob> {
    const job = this.jobRepository.create({
      id: input.id,
      relatorioId: input.relatorioId,
      userId: input.userId,
      tipo: input.tipo,
      status: RelatorioJobStatus.QUEUED,
      progress: 0,
      parametros: input.parametros ?? {},
    });

    return this.jobRepository.save(job);
  }

  async markProcessing(jobId: string, progress = 10): Promise<void> {
    await this.jobRepository.update(jobId, {
      status: RelatorioJobStatus.PROCESSING,
      progress,
    });
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    await this.jobRepository.update(jobId, { progress });
  }

  async markCompleted(
    jobId: string,
    resultPath: string | null = null,
  ): Promise<void> {
    await this.jobRepository.update(jobId, {
      status: RelatorioJobStatus.COMPLETED,
      progress: 100,
      resultPath,
      completedAt: new Date(),
      errorMessage: null,
    });
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.jobRepository.update(jobId, {
      status: RelatorioJobStatus.FAILED,
      errorMessage,
      completedAt: new Date(),
    });
  }

  async getJobStatus(jobId: string, userId: number): Promise<JobStatusResponse> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });

    if (!job) {
      throw new NotFoundException('Job não encontrado');
    }

    if (job.userId !== userId) {
      await this.reportService.findById(Number(job.relatorioId), userId);
    }

    const synced = await this.syncWithPgBoss(job);

    return this.toStatusResponse(synced);
  }

  async getJobForDownload(jobId: string, userId: number): Promise<RelatorioJob> {
    const status = await this.getJobStatus(jobId, userId);

    if (status.tipo !== RelatorioJobTipo.EXPORT_CSV) {
      throw new NotFoundException('Download disponível apenas para export CSV');
    }

    if (status.status !== RelatorioJobStatus.COMPLETED || !status.downloadAvailable) {
      throw new NotFoundException('Arquivo de exportação ainda não está disponível');
    }

    const job = await this.jobRepository.findOne({ where: { id: jobId } });

    if (!job?.resultPath) {
      throw new NotFoundException('Arquivo de exportação não encontrado');
    }

    return job;
  }

  private async syncWithPgBoss(job: RelatorioJob): Promise<RelatorioJob> {
    if (!this.pgBossService.isEnabled) {
      return job;
    }

    const queueName = this.resolveQueueName(job.tipo);
    const pgJob = await this.pgBossService.getJobById(queueName, job.id);

    if (!pgJob) {
      return job;
    }

    const mappedStatus = this.mapPgBossState(pgJob.state);

    if (
      mappedStatus !== job.status &&
      job.status !== RelatorioJobStatus.COMPLETED &&
      job.status !== RelatorioJobStatus.FAILED
    ) {
      job.status = mappedStatus;
      await this.jobRepository.save(job);
    }

    return job;
  }

  private mapPgBossState(state: JobWithMetadata['state']): RelatorioJobStatus {
    switch (state) {
      case 'created':
        return RelatorioJobStatus.QUEUED;
      case 'active':
        return RelatorioJobStatus.PROCESSING;
      case 'completed':
        return RelatorioJobStatus.COMPLETED;
      case 'failed':
      case 'cancelled':
        return RelatorioJobStatus.FAILED;
      default:
        return RelatorioJobStatus.QUEUED;
    }
  }

  private resolveQueueName(tipo: RelatorioJobTipo): string {
    return tipo === RelatorioJobTipo.SNAPSHOT
      ? REPORT_SNAPSHOT_QUEUE
      : REPORT_EXPORT_QUEUE;
  }

  private toStatusResponse(job: RelatorioJob): JobStatusResponse {
    return {
      jobId: job.id,
      tipo: job.tipo,
      status: job.status,
      progress: job.progress,
      relatorioId: Number(job.relatorioId),
      errorMessage: job.errorMessage,
      downloadAvailable:
        job.tipo === RelatorioJobTipo.EXPORT_CSV &&
        job.status === RelatorioJobStatus.COMPLETED &&
        Boolean(job.resultPath),
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }
}
