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
  REGRAS_PERMISSOES: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
