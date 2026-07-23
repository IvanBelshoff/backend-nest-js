import 'dotenv/config';
process.env.NODE_ENV ??= 'test';
process.env.REFRESH_TOKEN_PEPPER ??=
  'test-refresh-token-pepper-with-32-chars-min';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
process.env.PG_BOSS_ENABLED ??= 'false';
process.env.CONNECTION_ENCRYPTION_KEY ??=
  Buffer.alloc(32, 9).toString('base64');
process.env.MONGO_URI ??= 'mongodb://127.0.0.1:27017/datadash_reports_test';
process.env.MONGO_DB_NAME ??= 'datadash_reports_test';

jest.mock('pg-boss', () => ({
  PgBoss: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    createQueue: jest.fn().mockResolvedValue(undefined),
    work: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue('mock-job-id'),
    findJobs: jest.fn().mockResolvedValue([]),
  })),
}));
