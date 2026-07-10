import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_PASS: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  JWT_SECRET: z.string().min(1),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  CORS_ORIGIN: z.string().min(1),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  SALT_ROUNDS: z.coerce.number().int().positive(),
  DEFAULT_PROFILE_PHOTO_NAME: z.string().min(1),
  DEFAULT_PROFILE_PHOTO_LOCAL: z.string().min(1),
  DEFAULT_PROFILE_PHOTO_TYPE: z.string().min(1),
  NAME_USER_DEFAULT: z.string().min(1),
  SOBRENOME_USER_DEFAULT: z.string().min(1),
  EMAIL_USER_DEFAULT: z.string().email(),
  SENHA_USER_DEFAULT: z.string().min(1),
  SYNC_ROLES_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SEED_DASHBOARDS_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SEED_USERS_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  SENHA_USER_SEED_DEFAULT: z.string().min(1).default('SeedUser123'),
  REGRAS_PERMISSOES: z.string().optional(),
  SWAGGER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  MONGO_URI: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1),
  CONNECTION_ENCRYPTION_KEY: z.string().min(1),
  REPORT_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  REPORT_QUERY_MAX_ROWS: z.coerce.number().int().positive().default(10000),
  PG_BOSS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  REPORT_SNAPSHOT_QUEUE_NAME: z
    .string()
    .min(1)
    .default('report.snapshot.generate'),
  REPORT_SNAPSHOT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  REPORT_SNAPSHOT_RETRY_LIMIT: z.coerce.number().int().nonnegative().default(3),
  REPORT_SNAPSHOT_RETRY_DELAY_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  REPORT_EXPORT_QUEUE_NAME: z.string().min(1).default('report.export.csv'),
  REPORT_EXPORT_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(3),
  REPORT_EXPORT_RETRY_LIMIT: z.coerce.number().int().nonnegative().default(2),
  REPORT_EXPORT_DIR: z.string().min(1).default('src/shared/data/exports'),
  REPORT_EXPORT_TTL_HOURS: z.coerce.number().int().positive().default(24),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  SNAPSHOT_STORAGE_DIR: z.string().min(1).default('src/shared/data/snapshots'),
  SNAPSHOT_PARQUET_COMPRESSION: z
    .enum(['zstd', 'snappy', 'gzip', 'uncompressed'])
    .default('zstd'),
  SNAPSHOT_TTL_HOURS: z.coerce.number().int().positive().default(168),
  DUCKDB_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  DUCKDB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  SEED_RELATORIOS_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  METRICS_COLLECTION_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  METRICS_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
