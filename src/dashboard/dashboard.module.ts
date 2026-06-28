import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { dashboardProviders } from './dashboard.provider';

@Module({
  controllers: [DashboardController],
  providers: [...dashboardProviders, DashboardService],
  exports: [DashboardService, ...dashboardProviders],
})
export class DashboardModule {}
