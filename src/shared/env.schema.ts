import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  HOST: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  PASSWORD: z.string().min(1),
  JWT_SECRET: z.string().min(1),
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
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
