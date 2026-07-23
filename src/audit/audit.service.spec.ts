import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const leanExec = jest.fn().mockResolvedValue([]);
  const limit = jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: leanExec }) });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  const select = jest.fn().mockReturnValue({ sort });
  const find = jest.fn().mockReturnValue({ select });

  const auditModel = {
    create: jest.fn().mockResolvedValue({}),
    find,
    countDocuments: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    }),
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    }),
    distinct: jest.fn().mockResolvedValue(['auth.login.success']),
  };

  const originalAuditEnabled = process.env.AUDIT_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUDIT_ENABLED = 'true';
    leanExec.mockResolvedValue([]);
    limit.mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: leanExec }) });
    skip.mockReturnValue({ limit });
    sort.mockReturnValue({ skip });
    select.mockReturnValue({ sort });
    find.mockReturnValue({ select });
  });

  afterAll(() => {
    process.env.AUDIT_ENABLED = originalAuditEnabled;
  });

  it('record does not await persistence', () => {
    const service = new AuditService(auditModel as any);

    expect(() =>
      service.record({
        actor: { type: 'user', userId: 1, email: 'a@b.com' },
        action: 'user.create',
        category: 'user',
        outcome: 'success',
      }),
    ).not.toThrow();

    expect(auditModel.create).toHaveBeenCalled();
  });

  it('findPaginated projects out heavy fields and maps list items', async () => {
    const objectId = new Types.ObjectId();
    leanExec.mockResolvedValue([
      {
        _id: objectId,
        actor_user_id: 1,
        actor_email: 'a@b.com',
        actor_type: 'user',
        action: 'user.create',
        category: 'user',
        outcome: 'success',
        resource_type: 'user',
        resource_id: 42,
        criado_em: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const service = new AuditService(auditModel as any);
    const result = await service.findPaginated({ page: 1, pageSize: 50 });

    expect(find).toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('-metadata -http -correlation_id');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: objectId.toString(),
      actor_user_id: 1,
      actor_email: 'a@b.com',
      actor_type: 'user',
      action: 'user.create',
      category: 'user',
      outcome: 'success',
      resource_type: 'user',
      resource_id: 42,
      criado_em: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(result.items[0]).not.toHaveProperty('metadata');
    expect(result.items[0]).not.toHaveProperty('http');
    expect(result.items[0]).not.toHaveProperty('correlation_id');
  });

  it('findById returns full audit log item with metadata', async () => {
    const objectId = new Types.ObjectId();
    const doc = {
      _id: objectId,
      actor_user_id: 1,
      actor_email: 'a@b.com',
      actor_type: 'user',
      action: 'user.update',
      category: 'user',
      outcome: 'success',
      resource_type: 'user',
      resource_id: 42,
      http: { method: 'PATCH', path: '/users/42' },
      metadata: { changes: [{ field: 'nome', from: 'A', to: 'B' }] },
      correlation_id: 'corr-1',
      criado_em: new Date('2026-01-01T00:00:00.000Z'),
    };

    auditModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(doc),
      }),
    });

    const service = new AuditService(auditModel as any);
    const result = await service.findById(objectId.toString());

    expect(result).toMatchObject({
      id: objectId.toString(),
      action: 'user.update',
      metadata: doc.metadata,
      http: doc.http,
      correlation_id: 'corr-1',
    });
  });

  it('findById throws when id is invalid', async () => {
    const service = new AuditService(auditModel as any);

    await expect(service.findById('invalid-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});
