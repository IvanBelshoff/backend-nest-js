/* eslint-disable @typescript-eslint/no-floating-promises */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { env } from './shared/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ['x-total-count'],
  });
  await app.listen(process.env.PORT ?? 3000).then(() => {
    console.log(`Server is running on port ${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
