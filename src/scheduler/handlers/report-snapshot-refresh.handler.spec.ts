import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { ReportSnapshotService } from 'src/report/report-snapshot.service';
import { ReportSnapshotRefreshHandler } from './report-snapshot-refresh.handler';
import { ScheduleHandlerRegistry } from '../schedule-handler.registry';
import { AgendamentoVinculoTipo } from '../entities/scheduler.enums';

describe('ReportSnapshotRefreshHandler', () => {
  let handler: ReportSnapshotRefreshHandler;

  const handlerRegistry = {
    register: jest.fn(),
  };
  const reportSnapshotService = {
    scheduleSnapshotGeneration: jest.fn(),
  };
  const relatorioRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportSnapshotRefreshHandler,
        {
          provide: ScheduleHandlerRegistry,
          useValue: handlerRegistry,
        },
        {
          provide: ReportSnapshotService,
          useValue: reportSnapshotService,
        },
        {
          provide: getRepositoryToken(Relatorio),
          useValue: relatorioRepository,
        },
      ],
    }).compile();

    handler = module.get(ReportSnapshotRefreshHandler);
    handler.onModuleInit();
  });

  const baseCtx = {
    execucaoId: 1,
    agendamento: {} as never,
    vinculo: {
      id: 1,
      entidadeId: 7,
      tipo: AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
      payload: { userId: 42, parametros_snapshot: { mes: 1 } },
    } as never,
  };

  it('registra handler no bootstrap', () => {
    expect(handlerRegistry.register).toHaveBeenCalledWith(handler);
  });

  it('enfileira snapshot para relatório offline', async () => {
    relatorioRepository.findOne.mockResolvedValue({
      id: 7,
      estado: EstadoRelatorio.OFFLINE,
    });
    reportSnapshotService.scheduleSnapshotGeneration.mockResolvedValue('job-1');

    const result = await handler.execute(baseCtx);

    expect(result).toEqual({ status: 'completed', jobId: 'job-1' });
    expect(reportSnapshotService.scheduleSnapshotGeneration).toHaveBeenCalledWith(
      7,
      42,
      { mes: 1 },
    );
  });

  it('ignora relatório online', async () => {
    relatorioRepository.findOne.mockResolvedValue({
      id: 7,
      estado: EstadoRelatorio.ONLINE,
    });

    const result = await handler.execute(baseCtx);

    expect(result.status).toBe('skipped');
    expect(reportSnapshotService.scheduleSnapshotGeneration).not.toHaveBeenCalled();
  });
});
