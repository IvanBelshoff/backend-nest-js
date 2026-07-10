import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from 'src/queue/queue.module';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsHttpStore } from './metrics-http.store';
import { MetricsPersistenceService } from './metrics-persistence.service';
import { MetricsSchedulerService } from './metrics-scheduler.service';
import {
  SystemMetricSnapshotRecord,
  SystemMetricSnapshotSchema,
} from './schemas/system-metric-snapshot.schema';
import { SystemMetricsController } from './system-metrics.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    QueueModule,
    MongooseModule.forFeature([
      {
        name: SystemMetricSnapshotRecord.name,
        schema: SystemMetricSnapshotSchema,
      },
    ]),
  ],
  controllers: [SystemMetricsController],
  providers: [
    MetricsHttpStore,
    MetricsCollectorService,
    MetricsPersistenceService,
    MetricsSchedulerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class SystemMetricsModule {}
