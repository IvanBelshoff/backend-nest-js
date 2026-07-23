import { AuditController } from './audit.controller';

describe('AuditController', () => {
  const auditService = {
    findPaginated: jest.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    }),
    findById: jest.fn().mockResolvedValue({ id: 'abc', action: 'user.create' }),
    listDistinctActions: jest.fn().mockResolvedValue(['user.create']),
  };

  const controller = new AuditController(auditService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists audit logs with pagination', async () => {
    await expect(
      controller.list({
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });
  });

  it('returns distinct actions', async () => {
    await expect(controller.listActions()).resolves.toEqual({
      actions: ['user.create'],
    });
  });

  it('returns audit log by id', async () => {
    await expect(controller.findById('abc')).resolves.toEqual({
      id: 'abc',
      action: 'user.create',
    });
  });
});
