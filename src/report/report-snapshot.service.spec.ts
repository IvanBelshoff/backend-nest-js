jest.mock('./execution/report-execution.service', () => ({
  ReportExecutionService: class ReportExecutionService {},
}));

jest.mock('./storage/checksum.util', () => ({
  sha256File: jest.fn().mockResolvedValue('abc123'),
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
import { DuckDbService } from './duckdb/duckdb.service';
import { STORAGE_PROVIDER } from './storage/storage-provider.interface';

describe('ReportSnapshotService', () => {
  let service: ReportSnapshotService;
  const relatorioRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const snapshotModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    deleteOne: jest.fn(),
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
  const duckDbService = {
    writeParquet: jest.fn(),
    writeEmptyParquet: jest.fn(),
    describe: jest.fn(),
  };
  const storage = {
    driver: 'local',
    resolveWritePath: jest.fn(),
    finalizeWrite: jest.fn(),
    resolveReadUri: jest.fn(),
    exists: jest.fn(),
    stat: jest.fn(),
    delete: jest.fn(),
    listKeys: jest.fn(),
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
        {
          provide: DuckDbService,
          useValue: duckDbService,
        },
        {
          provide: STORAGE_PROVIDER,
          useValue: storage,
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

  it('materializes parquet metadata and marks offline on success', async () => {
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
    snapshotModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    storage.resolveWritePath.mockResolvedValue('/tmp/out.parquet');
    duckDbService.writeParquet.mockResolvedValue(undefined);
    duckDbService.describe.mockResolvedValue({ valor: 'BIGINT' });
    storage.finalizeWrite.mockResolvedValue(undefined);
    storage.stat.mockResolvedValue({ size: 128 });

    await service.generateSnapshot(1, 10, { status: 'ativo' });

    expect(relatorio.estado).toBe(EstadoRelatorio.OFFLINE);
    expect(relatorio.snapshot_valido).toBe(true);
    expect(duckDbService.writeParquet).toHaveBeenCalled();
    expect(snapshotModel.findOneAndUpdate).toHaveBeenCalledWith(
      { relatorio_id: 1 },
      expect.objectContaining({
        relatorio_id: 1,
        total_linhas: 1,
        storage_key: expect.stringContaining('rel_1/'),
        formato: 'parquet',
        checksum_sha256: 'abc123',
      }),
      { upsert: true, returnDocument: 'after' },
    );
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
