import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBossService } from 'src/queue/pg-boss.service';
import { SCHEDULER_DISPATCH_QUEUE } from 'src/queue/queue.constants';
import type { SchedulerDispatchPayload } from 'src/queue/types/scheduler-dispatch.payload';
import { Agendamento } from '../entities/Agendamento';
import { AgendamentoExecucao } from '../entities/AgendamentoExecucao';
import { AgendamentoVinculo } from '../entities/AgendamentoVinculo';
import { AgendamentoExecucaoStatus } from '../entities/scheduler.enums';
import { ScheduleHandlerRegistry } from '../schedule-handler.registry';
import { getNextCronExecution } from '../schedule-cron.util';

@Injectable()
export class ScheduleDispatcherWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduleDispatcherWorker.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly handlerRegistry: ScheduleHandlerRegistry,
    @InjectRepository(AgendamentoVinculo)
    private readonly vinculoRepository: Repository<AgendamentoVinculo>,
    @InjectRepository(AgendamentoExecucao)
    private readonly execucaoRepository: Repository<AgendamentoExecucao>,
    @InjectRepository(Agendamento)
    private readonly agendamentoRepository: Repository<Agendamento>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pgBossService.isEnabled) {
      return;
    }

    this.pgBossService.registerWorkHandler(
      SCHEDULER_DISPATCH_QUEUE,
      async (jobs) => {
        for (const job of jobs) {
          const payload = job.data as SchedulerDispatchPayload;
          await this.processDispatch(payload.vinculoId);
        }
      },
    );
  }

  private async processDispatch(vinculoId: number): Promise<void> {
    const vinculo = await this.vinculoRepository.findOne({
      where: { id: vinculoId },
      relations: { agendamento: true },
    });

    if (!vinculo?.agendamento) {
      this.logger.warn(`Vínculo ${vinculoId} não encontrado`);
      return;
    }

    if (!vinculo.ativo || !vinculo.agendamento.ativo) {
      return;
    }

    const execucao = this.execucaoRepository.create({
      vinculoId: vinculo.id,
      status: AgendamentoExecucaoStatus.STARTED,
    });
    const savedExecucao = await this.execucaoRepository.save(execucao);

    try {
      const result = await this.handlerRegistry.execute(vinculo.tipo, {
        vinculo,
        agendamento: vinculo.agendamento,
        execucaoId: savedExecucao.id,
      });

      savedExecucao.status =
        result.status === 'completed'
          ? AgendamentoExecucaoStatus.COMPLETED
          : result.status === 'skipped'
            ? AgendamentoExecucaoStatus.SKIPPED
            : AgendamentoExecucaoStatus.FAILED;
      savedExecucao.jobId = result.jobId ?? null;
      savedExecucao.erro = result.erro ?? null;
      savedExecucao.concluidoEm = new Date();
      await this.execucaoRepository.save(savedExecucao);

      vinculo.agendamento.ultimaExecucao = new Date();
      vinculo.agendamento.proximaExecucao = getNextCronExecution(
        vinculo.agendamento.cronExpression,
        vinculo.agendamento.timezone,
      );
      await this.agendamentoRepository.save(vinculo.agendamento);
    } catch (error) {
      savedExecucao.status = AgendamentoExecucaoStatus.FAILED;
      savedExecucao.erro =
        error instanceof Error ? error.message : 'Falha na execução do agendamento';
      savedExecucao.concluidoEm = new Date();
      await this.execucaoRepository.save(savedExecucao);

      this.logger.error(
        `Falha no dispatcher do vínculo ${vinculoId}: ${savedExecucao.erro}`,
      );
    }
  }
}
