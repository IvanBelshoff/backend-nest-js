import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatMessage } from 'src/database/entities/AiChatMessage';
import { AiChatThread } from 'src/database/entities/AiChatThread';
import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';
import { DashboardModule } from 'src/dashboard/dashboard.module';
import { ReportModule } from 'src/report/report.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';
import { SystemMetricsModule } from 'src/system-metrics/system-metrics.module';
import { UsersModule } from 'src/user/user.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAccessService } from './ai-access.service';
import { AiAccessGuard } from './ai-access.guard';
import { AiAdminToolsService } from './ai-admin-tools.service';
import { AiChatService } from './ai-chat.service';
import { AiChatPersistenceService } from './ai-chat-persistence.service';
import { AiReportToolsService } from './ai-report-tools.service';
import { AiThreadTitleService } from './ai-thread-title.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuario,
      UsuarioRelatorio,
      AiChatThread,
      AiChatMessage,
      Relatorio,
    ]),
    ReportModule,
    UsersModule,
    DashboardModule,
    SystemMetricsModule,
    SchedulerModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiAccessService,
    AiAccessGuard,
    AiChatService,
    AiChatPersistenceService,
    AiReportToolsService,
    AiAdminToolsService,
    AiThreadTitleService,
  ],
  exports: [AiAccessService],
})
export class AiModule {}
