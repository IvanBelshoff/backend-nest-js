import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from 'src/queue/queue.module';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoExecucao } from './entities/AgendamentoExecucao';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import { ScheduleCronBuilder } from './schedule-cron.builder';
import { ScheduleHandlerRegistry } from './schedule-handler.registry';
import { ScheduleSyncService } from './schedule-sync.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';
import { ScheduleDispatcherWorker } from './workers/schedule-dispatcher.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agendamento,
      AgendamentoVinculo,
      AgendamentoExecucao,
    ]),
    QueueModule,
  ],
  controllers: [SchedulerController],
  providers: [
    SchedulerService,
    ScheduleSyncService,
    ScheduleHandlerRegistry,
    ScheduleDispatcherWorker,
    ScheduleCronBuilder,
  ],
  exports: [SchedulerService, ScheduleHandlerRegistry],
})
export class SchedulerModule {}
