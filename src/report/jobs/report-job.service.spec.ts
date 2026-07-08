jest.mock('../report.service', () => ({
  ReportService: class ReportService {},
}));

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PgBossService } from 'src/queue/pg-boss.service';
import { ReportService } from '../report.service';
import {
  RelatorioJob,
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { ReportJobService } from './report-job.service';

describe('ReportJobService', () => {
  let service: ReportJobService;

  const jobRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const pgBossService = {
    isEnabled: true,
    getJobById: jest.fn(),
  };
  const reportService = {
    findById: jest.fn(),
  };

  const baseJob: RelatorioJob = {
    id: '11111111-1111-1111-1111-111111111111',
    relatorioId: 42,
    userId: 10,
    tipo: RelatorioJobTipo.EXPORT_CSV,
    status: RelatorioJobStatus.QUEUED,
    progress: 0,
    resultPath: null,
    errorMessage: null,
    parametros: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    relatorio: undefined as never,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportJobService,
        { provide: getRepositoryToken(RelatorioJob), useValue: jobRepository },
        { provide: PgBossService, useValue: pgBossService },
        { provide: ReportService, useValue: reportService },
      ],
    }).compile();

    service = module.get(ReportJobService);
  });

  it('returns job status for owner', async () => {
    jobRepository.findOne.mockResolvedValue({ ...baseJob });
    pgBossService.getJobById.mockResolvedValue({ state: 'active' });

    const status = await service.getJobStatus(baseJob.id, 10);

    expect(status.jobId).toBe(baseJob.id);
    expect(status.status).toBe(RelatorioJobStatus.PROCESSING);
    expect(status.downloadAvailable).toBe(false);
  });

  it('maps pg-boss completed state and exposes download when file exists', async () => {
    jobRepository.findOne.mockResolvedValue({
      ...baseJob,
      status: RelatorioJobStatus.PROCESSING,
      progress: 90,
      resultPath: '/tmp/export.csv',
    });
    pgBossService.getJobById.mockResolvedValue({ state: 'completed' });

    const status = await service.getJobStatus(baseJob.id, 10);

    expect(status.status).toBe(RelatorioJobStatus.COMPLETED);
    expect(status.downloadAvailable).toBe(true);
  });

  it('allows access via report permission when user is not job owner', async () => {
    jobRepository.findOne.mockResolvedValue({ ...baseJob, userId: 99 });
    pgBossService.getJobById.mockResolvedValue(null);
    reportService.findById.mockResolvedValue({ id: 42 });

    const status = await service.getJobStatus(baseJob.id, 10);

    expect(reportService.findById).toHaveBeenCalledWith(42, 10);
    expect(status.relatorioId).toBe(42);
  });

  it('throws when job does not exist', async () => {
    jobRepository.findOne.mockResolvedValue(null);

    await expect(service.getJobStatus(baseJob.id, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects download when export is not completed', async () => {
    jobRepository.findOne.mockResolvedValue({
      ...baseJob,
      status: RelatorioJobStatus.PROCESSING,
    });
    pgBossService.getJobById.mockResolvedValue({ state: 'active' });

    await expect(
      service.getJobForDownload(baseJob.id, 10),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
