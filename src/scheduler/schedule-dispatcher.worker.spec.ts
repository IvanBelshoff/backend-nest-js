import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PgBossService } from 'src/queue/pg-boss.service';
import { ScheduleDispatcherWorker } from './workers/schedule-dispatcher.worker';
import { ScheduleHandlerRegistry } from './schedule-handler.registry';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoExecucao } from './entities/AgendamentoExecucao';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import {
  AgendamentoExecucaoStatus,
  AgendamentoVinculoTipo,
} from './entities/scheduler.enums';

describe('ScheduleDispatcherWorker', () => {
  let worker: ScheduleDispatcherWorker;

  const pgBossService = {
    isEnabled: true,
    registerWorkHandler: jest.fn(),
  };
  const handlerRegistry = {
    execute: jest.fn(),
  };
  const vinculoRepository = {
    findOne: jest.fn(),
  };
  const execucaoRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 100, ...data })),
  };
  const agendamentoRepository = {
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleDispatcherWorker,
        { provide: PgBossService, useValue: pgBossService },
        { provide: ScheduleHandlerRegistry, useValue: handlerRegistry },
        {
          provide: getRepositoryToken(AgendamentoVinculo),
          useValue: vinculoRepository,
        },
        {
          provide: getRepositoryToken(AgendamentoExecucao),
          useValue: execucaoRepository,
        },
        {
          provide: getRepositoryToken(Agendamento),
          useValue: agendamentoRepository,
        },
      ],
    }).compile();

    worker = module.get(ScheduleDispatcherWorker);
  });

  it('registra worker no bootstrap', () => {
    worker.onApplicationBootstrap();
    expect(pgBossService.registerWorkHandler).toHaveBeenCalled();
  });

  it('processa dispatch até completed', async () => {
    vinculoRepository.findOne.mockResolvedValue({
      id: 1,
      ativo: true,
      tipo: AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
      agendamento: {
        id: 1,
        ativo: true,
        cronExpression: '0 */1 * * *',
        timezone: 'America/Sao_Paulo',
      },
    });
    handlerRegistry.execute.mockResolvedValue({
      status: 'completed',
      jobId: 'job-uuid',
    });

    worker.onApplicationBootstrap();
    const handler = pgBossService.registerWorkHandler.mock.calls[0][1];
    await handler([{ id: 'j1', data: { vinculoId: 1 } }]);

    expect(execucaoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgendamentoExecucaoStatus.COMPLETED,
        jobId: 'job-uuid',
      }),
    );
    expect(agendamentoRepository.save).toHaveBeenCalled();
  });
});
