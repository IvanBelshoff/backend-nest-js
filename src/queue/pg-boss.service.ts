import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PgBoss, type JobWithMetadata, type SendOptions } from 'pg-boss';
import { buildPgConnectionString } from './pg-connection.util';
import {
  REPORT_EXPORT_QUEUE,
  REPORT_SNAPSHOT_QUEUE,
} from './queue.constants';
import { env } from 'src/shared/env.schema';

type WorkHandler = (jobs: JobWithMetadata[]) => Promise<void>;

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);
  private boss: PgBoss | null = null;
  private readonly workHandlers = new Map<string, WorkHandler>();

  get isEnabled(): boolean {
    return env.PG_BOSS_ENABLED;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn('pg-boss desabilitado (PG_BOSS_ENABLED=false)');
      return;
    }

    this.boss = new PgBoss({
      connectionString: buildPgConnectionString(),
      schema: env.PG_BOSS_SCHEMA,
    });

    await this.boss.start();
    await this.ensureQueues();

    for (const [queueName, handler] of this.workHandlers.entries()) {
      await this.registerWorker(queueName, handler);
    }

    this.logger.log('pg-boss iniciado no mesmo processo da API');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) {
      await this.boss.stop();
      this.boss = null;
    }
  }

  registerWorkHandler(queueName: string, handler: WorkHandler): void {
    this.workHandlers.set(queueName, handler);

    if (this.boss) {
      void this.registerWorker(queueName, handler);
    }
  }

  private async ensureQueues(): Promise<void> {
    if (!this.boss) {
      return;
    }

    await this.boss.createQueue(REPORT_SNAPSHOT_QUEUE, {
      retryLimit: env.REPORT_SNAPSHOT_RETRY_LIMIT,
      retryDelay: env.REPORT_SNAPSHOT_RETRY_DELAY_SECONDS,
    });

    await this.boss.createQueue(REPORT_EXPORT_QUEUE, {
      retryLimit: env.REPORT_EXPORT_RETRY_LIMIT,
      retryDelay: 30,
    });
  }

  private async registerWorker(
    queueName: string,
    handler: WorkHandler,
  ): Promise<void> {
    if (!this.boss) {
      return;
    }

    const concurrency =
      queueName === REPORT_SNAPSHOT_QUEUE
        ? env.REPORT_SNAPSHOT_QUEUE_CONCURRENCY
        : env.REPORT_EXPORT_QUEUE_CONCURRENCY;

    await this.boss.work(
      queueName,
      { batchSize: concurrency },
      async (jobs) => {
        await handler(jobs as JobWithMetadata[]);
      },
    );

    this.logger.log(`Worker registrado na fila ${queueName}`);
  }

  async send<T extends object>(
    queueName: string,
    data: T,
    options: SendOptions = {},
  ): Promise<string> {
    if (!this.isEnabled || !this.boss) {
      throw new Error('pg-boss não está habilitado');
    }

    const jobId = await this.boss.send(queueName, data, options);

    if (!jobId) {
      throw new Error(`Falha ao enfileirar job na fila ${queueName}`);
    }

    return jobId;
  }

  async getJobById<T extends object>(
    queueName: string,
    jobId: string,
  ): Promise<JobWithMetadata<T> | null> {
    if (!this.isEnabled || !this.boss) {
      return null;
    }

    const jobs = await this.boss.findJobs<T>(queueName, {
      id: jobId,
    });

    return jobs[0] ?? null;
  }
}
