import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PgBossService } from 'src/queue/pg-boss.service';
import { AI_DASHBOARD_EXPLORE_QUEUE } from 'src/queue/queue.constants';
import type { AiDashboardExploreJobPayload } from 'src/queue/types/ai-dashboard-explore-job.payload';
import { AiDashboardExploreService } from '../ai-dashboard-explore.service';

@Injectable()
export class AiDashboardExploreWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiDashboardExploreWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly exploreService: AiDashboardExploreService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    this.pgBossService.registerWorkHandler(
      AI_DASHBOARD_EXPLORE_QUEUE,
      async (jobs) => {
        for (const job of jobs) {
          const payload = job.data as AiDashboardExploreJobPayload;
          this.logger.log(
            `Processando explore job ${payload.jobId} fase=${payload.fase}`,
          );
          await this.exploreService.processJob(payload);
        }
      },
    );
  }
}
