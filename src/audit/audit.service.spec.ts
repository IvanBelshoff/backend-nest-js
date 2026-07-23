import { AuditService } from './audit.service';

describe('AuditService', () => {
  const auditModel = {
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
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
});
