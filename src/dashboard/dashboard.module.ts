import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Dashboard } from 'src/database/entities/Dashboards';
import { Usuario } from 'src/database/entities/Usuarios';

@Module({
  imports: [TypeOrmModule.forFeature([Dashboard, Usuario])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
