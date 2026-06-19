/* eslint-disable @typescript-eslint/no-floating-promises */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SyncRolesAndPermissions } from './shared/services/SyncRolesAndPermissions';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const teste = new SyncRolesAndPermissions();
  await app.listen(process.env.PORT ?? 3000).then(() => {
    teste.syncRolesAndPermissions();
    console.log(`Server is running on port ${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
