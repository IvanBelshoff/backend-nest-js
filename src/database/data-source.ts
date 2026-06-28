import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getTypeOrmConfig } from './typeorm.config';

export default new DataSource({
  ...getTypeOrmConfig(),
  migrations: [`${__dirname}/**/migrations/*.{ts,js}`],
});
