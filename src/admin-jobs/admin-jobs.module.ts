import { Module } from '@nestjs/common';
import { ReportModule } from 'src/report/report.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';
import { AdminJobsController } from './admin-jobs.controller';

@Module({
  imports: [ReportModule, SchedulerModule],
  controllers: [AdminJobsController],
})
export class AdminJobsModule {}
