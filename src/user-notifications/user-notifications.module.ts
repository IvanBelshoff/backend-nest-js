import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardModule } from 'src/dashboard/dashboard.module';
import { Relatorio } from 'src/database/entities/Relatorios';
import { UserNotification } from 'src/database/entities/UserNotification';
import { ReportModule } from 'src/report/report.module';
import { UsersModule } from 'src/user/user.module';
import { UserMeController } from './user-me.controller';
import { UserMeSummaryService } from './user-me-summary.service';
import { UserNotificationService } from './user-notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserNotification, Relatorio]),
    forwardRef(() => UsersModule),
    forwardRef(() => ReportModule),
    DashboardModule,
  ],
  controllers: [UserMeController],
  providers: [UserNotificationService, UserMeSummaryService],
  exports: [UserNotificationService],
})
export class UserNotificationsModule {}
