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
import { UserNotificationService } from './user-notification.service';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserNotificationService,
        {
          provide: getRepositoryToken(UserNotification),
          useValue: notificationRepository,
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

    const job = {
      id: '11111111-1111-1111-1111-111111111111',
      relatorioId: 10,
      userId: 5,
      tipo: RelatorioJobTipo.EXPORT_CSV,
      status: RelatorioJobStatus.COMPLETED,
      progress: 100,
      resultPath: '/tmp/export.csv',
      errorMessage: null,
      parametros: {},
      createdAt: new Date(),
      completedAt: new Date(),
    };

    const result = await service.createFromJob(job, {
      id: 10,
      nome: 'Relatório Teste',
    });

    expect(result?.type).toBe(UserNotificationType.EXPORT_READY);
    expect(notificationRepository.save).toHaveBeenCalled();
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

    const job = {
      id: '11111111-1111-1111-1111-111111111111',
      relatorioId: 10,
      userId: 5,
      tipo: RelatorioJobTipo.EXPORT_CSV,
      status: RelatorioJobStatus.COMPLETED,
      progress: 100,
      resultPath: '/tmp/export.csv',
      errorMessage: null,
      parametros: {},
      createdAt: new Date(),
      completedAt: new Date(),
    };

    const result = await service.createFromJob(job, { id: 10, nome: 'Relatório' });

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
