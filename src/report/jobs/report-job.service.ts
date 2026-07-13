import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { JobWithMetadata } from 'pg-boss';
import { In, Repository } from 'typeorm';
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
import { Usuario } from 'src/database/entities/Usuarios';
import type { ListAdminJobsQueryDto } from 'src/admin-jobs/dto/list-admin-jobs-query.dto';
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

export type AdminJobListItem = JobStatusResponse & {
  relatorioNome: string;
  userId: number;
  userNome: string;
  origem: 'manual' | 'agendado';
  parametros: Record<string, unknown>;
};

export type SnapshotHistoryItem = JobStatusResponse & {
  userId: number;
  userNome: string;
  origem: 'manual' | 'agendado';
  parametros: Record<string, unknown>;
};

export interface AdminJobListResult {
  items: AdminJobListItem[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ReportJobService {
  constructor(
    @InjectRepository(RelatorioJob)
    private readonly jobRepository: Repository<RelatorioJob>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
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

  async listJobsForAdmin(
    query: ListAdminJobsQueryDto,
  ): Promise<AdminJobListResult> {
    const page = query.page;
    const pageSize = query.page_size;
    const sortDesc = query.sort === 'created_at:desc';

    const qb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.relatorio', 'relatorio');

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    if (query.tipo) {
      qb.andWhere('job.tipo = :tipo', { tipo: query.tipo });
    }

    if (query.relatorio_id) {
      qb.andWhere('job.relatorio_id = :relatorioId', {
        relatorioId: query.relatorio_id,
      });
    }

    if (query.user_id) {
      qb.andWhere('job.user_id = :userId', { userId: query.user_id });
    }

    if (query.job_id) {
      qb.andWhere('job.id = :jobId', { jobId: query.job_id });
    }

    if (query.created_from) {
      qb.andWhere('job.created_at >= :createdFrom', {
        createdFrom: query.created_from,
      });
    }

    if (query.created_to) {
      qb.andWhere('job.created_at <= :createdTo', {
        createdTo: query.created_to,
      });
    }

    qb.orderBy('job.created_at', sortDesc ? 'DESC' : 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rows, total] = await qb.getManyAndCount();

    const jobIds = rows.map((row) => row.id);
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const scheduledJobIds = await this.loadScheduledJobIds(jobIds);

    const users =
      userIds.length > 0
        ? await this.usuarioRepository.find({
            where: { id: In(userIds) },
          })
        : [];
    const usersById = new Map(users.map((user) => [Number(user.id), user]));

    const items: AdminJobListItem[] = rows.map((job) => {
      const usuario = usersById.get(job.userId);
      const userNome = usuario
        ? `${usuario.nome} ${usuario.sobrenome}`.trim()
        : `Usuário #${job.userId}`;

      return {
        ...this.toStatusResponse(job),
        relatorioNome: job.relatorio?.nome ?? `Relatório #${job.relatorioId}`,
        userId: job.userId,
        userNome,
        origem: scheduledJobIds.has(job.id) ? 'agendado' : 'manual',
        parametros: job.parametros ?? {},
      };
    });

    return { items, page, pageSize, total };
  }

  async listSnapshotHistoryForReport(
    relatorioId: number,
    limit = 50,
  ): Promise<SnapshotHistoryItem[]> {
    const rows = await this.jobRepository.find({
      where: {
        relatorioId,
        tipo: RelatorioJobTipo.SNAPSHOT,
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    if (rows.length === 0) {
      return [];
    }

    const jobIds = rows.map((row) => row.id);
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const scheduledJobIds = await this.loadScheduledJobIds(jobIds);

    const users =
      userIds.length > 0
        ? await this.usuarioRepository.find({
            where: { id: In(userIds) },
          })
        : [];
    const usersById = new Map(users.map((user) => [Number(user.id), user]));

    return rows.map((job) => {
      const usuario = usersById.get(job.userId);
      const userNome = usuario
        ? `${usuario.nome} ${usuario.sobrenome}`.trim()
        : `Usuário #${job.userId}`;

      return {
        ...this.toStatusResponse(job),
        userId: job.userId,
        userNome,
        origem: scheduledJobIds.has(job.id) ? 'agendado' : 'manual',
        parametros: job.parametros ?? {},
      };
    });
  }

  private async loadScheduledJobIds(jobIds: string[]): Promise<Set<string>> {
    const scheduledJobIds = new Set<string>();

    if (jobIds.length === 0) {
      return scheduledJobIds;
    }

    const scheduled = await this.jobRepository.manager.query<
      { job_id: string }[]
    >(
      `SELECT DISTINCT job_id FROM agendamento_execucoes WHERE job_id = ANY($1::uuid[])`,
      [jobIds],
    );

    for (const row of scheduled) {
      if (row.job_id) {
        scheduledJobIds.add(row.job_id);
      }
    }

    return scheduledJobIds;
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
