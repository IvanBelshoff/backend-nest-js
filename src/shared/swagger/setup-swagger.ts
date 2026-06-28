import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from '../env.schema';

export function setupSwagger(app: INestApplication): void {
  if (env.NODE_ENV === 'production' && !env.SWAGGER_ENABLED) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('DataDash API')
    .setDescription('Backend NestJS — autenticação, usuários e dashboards')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token (Authorization: Bearer <token>)',
      },
      'access-token',
    )
    .addTag('health', 'Health check público')
    .addTag('auth', 'Login, refresh, logout e profile')
    .addTag('user', 'Gestão de usuários')
    .addTag('dashboards', 'Gestão de dashboards')
    .addTag('icones', 'Catálogo de ícones paginado')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
