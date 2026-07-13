import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ScheduleSyncService } from './schedule-sync.service';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import { AgendamentoExecucao } from './entities/AgendamentoExecucao';
import {
  AgendamentoFrequencia,
  AgendamentoVinculoTipo,
} from './entities/scheduler.enums';

describe('SchedulerService', () => {
  let service: SchedulerService;

  const agendamentoRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 1, ...data })),
    findOne: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
  };
  const vinculoRepository = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 10, ...data })),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };
  const execucaoRepository = {
    find: jest.fn(),
  };
  const scheduleSyncService = {
    syncVinculo: jest.fn(),
    unsyncVinculo: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: getRepositoryToken(Agendamento),
          useValue: agendamentoRepository,
        },
        {
          provide: getRepositoryToken(AgendamentoVinculo),
          useValue: vinculoRepository,
        },
        {
          provide: getRepositoryToken(AgendamentoExecucao),
          useValue: execucaoRepository,
        },
        {
          provide: ScheduleSyncService,
          useValue: scheduleSyncService,
        },
      ],
    }).compile();

    service = module.get(SchedulerService);
  });

  it('cria agendamento com cron materializado', async () => {
    const result = await service.createAgendamento(
      {
        nome: 'Teste',
        frequencia: AgendamentoFrequencia.HORA,
        intervalo: 2,
        timezone: 'America/Sao_Paulo',
        dias_semana: [],
        horas: [],
        minutos: [0],
        ativo: true,
      },
      { sub: 1, email: 'user@test.com' },
    );

    expect(result.cronExpression).toBe('0 */2 * * *');
    expect(agendamentoRepository.save).toHaveBeenCalled();
  });

  it('sincroniza vínculo ao criar', async () => {
    agendamentoRepository.findOne.mockResolvedValue({
      id: 1,
      ativo: true,
      cronExpression: '0 */1 * * *',
      timezone: 'America/Sao_Paulo',
    });
    vinculoRepository.findOne.mockResolvedValue(null);
    vinculoRepository.save
      .mockResolvedValueOnce({ id: 10, pgbossScheduleKey: 'pending-1' })
      .mockResolvedValueOnce({
        id: 10,
        pgbossScheduleKey: 'vinculo-10',
        ativo: true,
        agendamentoId: 1,
      });

    await service.createVinculo(1, {
      tipo: AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
      entidade_tipo: 'relatorio',
      entidade_id: 5,
      payload: { userId: 1 },
      ativo: true,
    });

    expect(scheduleSyncService.syncVinculo).toHaveBeenCalled();
  });

  it('rejeita vínculo duplicado', async () => {
    agendamentoRepository.findOne.mockResolvedValue({ id: 1, ativo: true });
    vinculoRepository.findOne.mockResolvedValue({ id: 99 });

    await expect(
      service.createVinculo(1, {
        tipo: AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
        entidade_tipo: 'relatorio',
        entidade_id: 5,
        payload: {},
        ativo: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pausa vínculo por entidade', async () => {
    vinculoRepository.findOne.mockResolvedValue({
      id: 10,
      pgbossScheduleKey: 'vinculo-10',
      ativo: true,
    });

    await service.pauseVinculoByEntity(
      'relatorio',
      5,
      AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
    );

    expect(vinculoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ ativo: false }),
    );
    expect(scheduleSyncService.unsyncVinculo).toHaveBeenCalled();
  });
});
