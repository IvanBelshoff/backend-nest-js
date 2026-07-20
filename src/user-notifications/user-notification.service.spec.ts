import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import {
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import {
  UserNotification,
  UserNotificationType,
} from 'src/database/entities/UserNotification';
import { ReportJobService } from 'src/report/jobs/report-job.service';
import {
  buildNotificationContent,
  buildNotificationPayload,
  buildParametrosResumo,
} from './user-notification-content';
import { UserNotificationService } from './user-notification.service';

const completedExportJob = {
  id: '11111111-1111-1111-1111-111111111111',
  relatorioId: 10,
  userId: 5,
  tipo: RelatorioJobTipo.EXPORT_CSV,
  status: RelatorioJobStatus.COMPLETED,
  progress: 100,
  resultPath: '/tmp/exports/vendas-2026.csv',
  errorMessage: null,
  parametros: { status: 'ativo', regiao: 'sul' },
  createdAt: new Date('2026-07-20T10:00:00.000Z'),
  completedAt: new Date('2026-07-20T10:05:00.000Z'),
};

describe('UserNotificationService', () => {
  let service: UserNotificationService;

  const notificationRepository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const reportJobService = {
    resolveJobOrigem: jest.fn(),
  };

  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    notificationRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    reportJobService.resolveJobOrigem.mockResolvedValue('manual');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserNotificationService,
        {
          provide: getRepositoryToken(UserNotification),
          useValue: notificationRepository,
        },
        {
          provide: ReportJobService,
          useValue: reportJobService,
        },
      ],
    }).compile();

    service = module.get(UserNotificationService);
  });

  it('creates export_ready notification from completed job', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    notificationRepository.create.mockImplementation((input) => input);
    notificationRepository.save.mockImplementation(async (input) => ({
      ...input,
      id: 'notification-id',
      createdAt: new Date(),
    }));

    const result = await service.createFromJob(completedExportJob, {
      id: 10,
      nome: 'Relatório Teste',
    });

    expect(result?.type).toBe(UserNotificationType.EXPORT_READY);
    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Exportação concluída — Relatório Teste',
        payload: expect.objectContaining({
          jobId: completedExportJob.id,
          relatorioNome: 'Relatório Teste',
          completedAt: completedExportJob.completedAt.toISOString(),
          origem: 'manual',
          fileName: 'vendas-2026.csv',
          parametrosResumo: '2 filtros aplicados',
          downloadAvailable: true,
        }),
      }),
    );
    expect(notificationRepository.save).toHaveBeenCalled();
  });

  it('creates snapshot notification with agendado origem', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    notificationRepository.create.mockImplementation((input) => input);
    notificationRepository.save.mockImplementation(async (input) => ({
      ...input,
      id: 'notification-id',
      createdAt: new Date(),
    }));
    reportJobService.resolveJobOrigem.mockResolvedValue('agendado');

    const job = {
      ...completedExportJob,
      tipo: RelatorioJobTipo.SNAPSHOT,
      resultPath: null,
      parametros: {},
    };

    const result = await service.createFromJob(job, {
      id: 10,
      nome: 'Vendas Mensais',
    });

    expect(result?.type).toBe(UserNotificationType.SNAPSHOT_READY);
    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Snapshot atualizado — Vendas Mensais',
        payload: expect.objectContaining({
          origem: 'agendado',
          fileName: null,
          parametrosResumo: null,
        }),
      }),
    );
  });

  it('returns existing notification for same job id', async () => {
    const existing = {
      id: 'existing-id',
      userId: 5,
      type: UserNotificationType.EXPORT_READY,
      title: 'Exportação concluída',
      body: 'body',
      payload: { jobId: '11111111-1111-1111-1111-111111111111' },
      readAt: null,
      createdAt: new Date(),
    };

    queryBuilder.getOne.mockResolvedValue(existing);

    const result = await service.createFromJob(completedExportJob, {
      id: 10,
      nome: 'Relatório',
    });

    expect(result).toBe(existing);
    expect(notificationRepository.save).not.toHaveBeenCalled();
  });

  it('counts unread notifications', async () => {
    notificationRepository.count.mockResolvedValue(3);

    const count = await service.getUnreadCount(5);

    expect(count).toBe(3);
    expect(notificationRepository.count).toHaveBeenCalledWith({
      where: {
        userId: 5,
        readAt: IsNull(),
      },
    });
  });
});

describe('user-notification-content', () => {
  it('builds informative titles with report name', () => {
    const content = buildNotificationContent(
      {
        ...({
          tipo: RelatorioJobTipo.EXPORT_CSV,
          status: RelatorioJobStatus.COMPLETED,
        } as const),
      } as never,
      'Vendas Mensais',
    );

    expect(content.title).toBe('Exportação concluída — Vendas Mensais');
    expect(content.type).toBe(UserNotificationType.EXPORT_READY);
  });

  it('builds parametros resumo from active filters', () => {
    expect(buildParametrosResumo({})).toBeNull();
    expect(buildParametrosResumo({ status: 'ativo' })).toBe('1 filtro aplicado');
    expect(buildParametrosResumo({ status: 'ativo', regiao: 'sul' })).toBe(
      '2 filtros aplicados',
    );
  });

  it('builds payload with file name and completedAt', () => {
    const payload = buildNotificationPayload(
      completedExportJob as never,
      'Relatório Teste',
      true,
      'manual',
    );

    expect(payload.fileName).toBe('vendas-2026.csv');
    expect(payload.completedAt).toBe('2026-07-20T10:05:00.000Z');
    expect(payload.origem).toBe('manual');
  });
});
