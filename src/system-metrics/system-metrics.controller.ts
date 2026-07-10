import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
import { ZodQueryValidation } from 'src/shared/decorators/zod-validation.decorator';
import {
  metricsHistoryQuerySchema,
  type MetricsHistoryQueryDto,
} from './dto/metrics-history-query.dto';
import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsPersistenceService } from './metrics-persistence.service';

@Controller('admin/metrics')
@ApiTags('admin-metrics')
@ApiBearerAuth('access-token')
@Authorization('role', ['REGRA_ADMIN'])
export class SystemMetricsController {
  constructor(
    private readonly metricsCollectorService: MetricsCollectorService,
    private readonly metricsPersistenceService: MetricsPersistenceService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Métricas leves em tempo quase real (processo + HTTP)' })
  @ApiOkResponse({
    schema: {
      example: {
        recordedAt: '2026-07-10T14:30:00.000Z',
        process: {
          uptimeSeconds: 3600,
          memoryMb: { heapUsed: 180, rss: 320, external: 12 },
          loadAvg: [0.5, 0.4, 0.3],
          eventLoopLagMs: 2,
          cpuPercent: 12.5,
        },
        http: {
          requestsInWindow: 45,
          errorRatePercent: 1.2,
          latencyMs: { p50: 45, p95: 320, p99: 890 },
        },
      },
    },
  })
  async getLiveMetrics() {
    return this.metricsCollectorService.collectLiveSnapshot();
  }

  @Get('current')
  @ApiOperation({ summary: 'Snapshot atual das métricas do sistema' })
  @ApiOkResponse({
    schema: {
      example: {
        recordedAt: '2026-07-10T14:30:00.000Z',
        version: '0.0.1',
        environment: 'development',
        process: {
          uptimeSeconds: 3600,
          memoryMb: { heapUsed: 180, rss: 320, external: 12 },
          loadAvg: [0.5, 0.4, 0.3],
          eventLoopLagMs: 2,
          cpuPercent: 12.5,
        },
        dependencies: {
          postgresql: { status: 'up', latencyMs: 3 },
          mongodb: { status: 'up', latencyMs: 8 },
          pgBoss: {
            status: 'up',
            queues: [
              { name: 'report.snapshot.generate', pending: 2, active: 1, failed: 0 },
            ],
          },
        },
        http: {
          requestsInWindow: 45,
          errorRatePercent: 1.2,
          latencyMs: { p50: 45, p95: 320, p99: 890 },
        },
        storage: { snapshotsDiskMb: 2048, snapshotsFileCount: 156 },
      },
    },
  })
  async getCurrentMetrics() {
    return this.metricsCollectorService.collectSnapshot();
  }

  @Get('history')
  @ZodQueryValidation(metricsHistoryQuerySchema)
  @ApiOperation({ summary: 'Histórico de métricas persistidas no MongoDB' })
  @ApiOkResponse({
    schema: {
      example: {
        hours: 24,
        count: 120,
        items: [],
      },
    },
  })
  async getMetricsHistory(@Query() query: MetricsHistoryQueryDto) {
    const items = await this.metricsPersistenceService.findHistory(
      query.hours,
      query.limit,
    );

    return {
      hours: query.hours,
      count: items.length,
      items,
    };
  }
}
