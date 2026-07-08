jest.mock('./execution/report-execution.service', () => ({
  ReportExecutionService: class ReportExecutionService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { PgBossService } from 'src/queue/pg-boss.service';
import { RelatorioSnapshot } from './schemas/relatorio-snapshot.schema';
import { ReportExecutionService } from './execution/report-execution.service';
import { ReportSnapshotService } from './report-snapshot.service';
import { ReportJobService } from './jobs/report-job.service';
import { RelatorioJobTipo } from 'src/database/entities/RelatorioJobs';

describe('ReportSnapshotService', () => {
  let service: ReportSnapshotService;
  const relatorioRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const snapshotModel = {
    findOneAndUpdate: jest.fn(),
  };
  const reportExecutionService = {
    execute: jest.fn(),
  };
  const pgBossService = {
    send: jest.fn(),
  };
  const reportJobService = {
    createJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportSnapshotService,
        {
          provide: getModelToken(RelatorioSnapshot.name),
          useValue: snapshotModel,
        },
        {
          provide: getRepositoryToken(Relatorio),
          useValue: relatorioRepository,
        },
        {
          provide: ReportExecutionService,
          useValue: reportExecutionService,
        },
        {
          provide: PgBossService,
          useValue: pgBossService,
        },
        {
          provide: ReportJobService,
          useValue: reportJobService,
        },
      ],
    }).compile();

    service = module.get(ReportSnapshotService);
  });

  it('reverts to online when snapshot generation fails', async () => {
    const relatorio = {
      id: 1,
      estado: EstadoRelatorio.GERANDO_SNAPSHOT,
    } as Relatorio;

    relatorioRepository.findOne.mockResolvedValue(relatorio);
    reportExecutionService.execute.mockRejectedValue(new Error('falha na query'));
    relatorioRepository.save.mockImplementation(async (entity) => entity);

    await service.generateSnapshot(1, 10, {});

    expect(relatorio.estado).toBe(EstadoRelatorio.ONLINE);
    expect(relatorio.erro_ultima_geracao).toBe('falha na query');
    expect(snapshotModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('stores snapshot and marks offline on success', async () => {
    const relatorio = {
      id: 1,
      estado: EstadoRelatorio.GERANDO_SNAPSHOT,
    } as Relatorio;

    relatorioRepository.findOne.mockResolvedValue(relatorio);
    reportExecutionService.execute.mockResolvedValue({
      colunas: ['valor'],
      dados: [{ valor: 1 }],
      total_linhas: 1,
    });
    relatorioRepository.save.mockImplementation(async (entity) => entity);
    snapshotModel.findOneAndUpdate.mockResolvedValue({});

    await service.generateSnapshot(1, 10, { status: 'ativo' });

    expect(relatorio.estado).toBe(EstadoRelatorio.OFFLINE);
    expect(relatorio.snapshot_valido).toBe(true);
    expect(snapshotModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('enqueues snapshot job and registers metadata', async () => {
    pgBossService.send.mockResolvedValue('job-uuid');
    reportJobService.createJob.mockResolvedValue({});

    const jobId = await service.scheduleSnapshotGeneration(1, 10, { mes: 1 });

    expect(jobId).toBe('job-uuid');
    expect(pgBossService.send).toHaveBeenCalled();
    expect(reportJobService.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-uuid',
        relatorioId: 1,
        userId: 10,
        tipo: RelatorioJobTipo.SNAPSHOT,
      }),
    );
  });
});
