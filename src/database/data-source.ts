import 'dotenv/config';
import { DataSource } from 'typeorm';
import { env } from '../shared/env.schema';

export default new DataSource({
  type: 'postgres',
  host: env.HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.PASSWORD,
  database: env.DB_NAME,
  entities: [`${__dirname}/**/entities/*.{ts,js}`],
  migrations: [`${__dirname}/**/migrations/*.{ts,js}`],
});
