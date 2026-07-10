import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { env } from 'src/shared/env.schema';
import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsPersistenceService } from './metrics-persistence.service';

@Injectable()
export class MetricsSchedulerService {
  private readonly logger = new Logger(MetricsSchedulerService.name);

  constructor(
    private readonly metricsCollectorService: MetricsCollectorService,
    private readonly metricsPersistenceService: MetricsPersistenceService,
  ) {}

  @Interval(env.METRICS_COLLECTION_INTERVAL_SECONDS * 1000)
  async collectAndPersist(): Promise<void> {
    if (!env.METRICS_ENABLED) {
      return;
    }

    try {
      const snapshot = await this.metricsCollectorService.collectSnapshot();
      await this.metricsPersistenceService.saveSnapshot(snapshot);
    } catch (error) {
      this.logger.error(
        'Failed to collect and persist system metrics',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
