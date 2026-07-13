import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from 'src/queue/pg-boss.service';
import { SCHEDULER_DISPATCH_QUEUE } from 'src/queue/queue.constants';
import type { SchedulerDispatchPayload } from 'src/queue/types/scheduler-dispatch.payload';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import { getNextCronExecution } from './schedule-cron.util';

@Injectable()
export class ScheduleSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduleSyncService.name);

  constructor(
    private readonly pgBossService: PgBossService,
    @InjectRepository(AgendamentoVinculo)
    private readonly vinculoRepository: Repository<AgendamentoVinculo>,
    @InjectRepository(Agendamento)
    private readonly agendamentoRepository: Repository<Agendamento>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    const vinculos = await this.vinculoRepository.find({
      where: { ativo: true },
      relations: { agendamento: true },
    });

    for (const vinculo of vinculos) {
      if (!vinculo.agendamento?.ativo) {
        continue;
      }

      try {
        await this.syncVinculo(vinculo);
      } catch (error) {
        this.logger.error(
          `Falha ao sincronizar vínculo ${vinculo.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async syncVinculo(vinculo: AgendamentoVinculo): Promise<void> {
    if (!vinculo.agendamento) {
      const loaded = await this.vinculoRepository.findOne({
        where: { id: vinculo.id },
        relations: { agendamento: true },
      });

      if (!loaded?.agendamento) {
        throw new Error(`Agendamento não encontrado para vínculo ${vinculo.id}`);
      }

      vinculo = loaded;
    }

    if (!vinculo.ativo || !vinculo.agendamento.ativo) {
      await this.unsyncVinculo(vinculo);
      return;
    }

    const payload: SchedulerDispatchPayload = { vinculoId: vinculo.id };
    const cron = vinculo.agendamento.cronExpression;
    const timezone = vinculo.agendamento.timezone;

    await this.pgBossService.schedule(
      SCHEDULER_DISPATCH_QUEUE,
      cron,
      payload,
      { tz: timezone, key: vinculo.pgbossScheduleKey },
    );

    vinculo.agendamento.proximaExecucao = getNextCronExecution(cron, timezone);
    await this.agendamentoRepository.save(vinculo.agendamento);
  }

  async unsyncVinculo(vinculo: AgendamentoVinculo): Promise<void> {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    await this.pgBossService.unschedule(
      SCHEDULER_DISPATCH_QUEUE,
      vinculo.pgbossScheduleKey,
    );
  }
}
