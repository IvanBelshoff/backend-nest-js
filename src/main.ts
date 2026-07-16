import 'dotenv/config';
/* eslint-disable @typescript-eslint/no-floating-promises */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './shared/env.schema';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { setupSwagger } from './shared/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  }

  app.enableCors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ['x-total-count', 'X-Thread-Id', 'X-Thread-Title'],
  });

  setupSwagger(app);
  await app.listen(env.PORT).then(() => {
    console.log(`Server is running on port ${env.PORT}`);
  });
}
bootstrap();
