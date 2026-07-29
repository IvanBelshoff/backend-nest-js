import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PgBossService } from 'src/queue/pg-boss.service';
import { AI_ANALYSIS_QUEUE } from 'src/queue/queue.constants';
import type { AiAnalysisJobPayload } from 'src/queue/types/ai-analysis-job.payload';
import { AiAnalysisService } from '../ai-analysis.service';

@Injectable()
export class AiAnalysisWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiAnalysisWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly aiAnalysisService: AiAnalysisService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    this.pgBossService.registerWorkHandler(AI_ANALYSIS_QUEUE, async (jobs) => {
      for (const job of jobs) {
        const payload = job.data as AiAnalysisJobPayload;

        try {
          await this.aiAnalysisService.runQueuedAnalysis(job.id, payload);
        } catch (error) {
          this.logger.error(
            `Falha no job de análise ${job.id}: ${
              error instanceof Error ? error.message : 'erro desconhecido'
            }`,
          );
          throw error;
        }
      }
    });
  }
}
