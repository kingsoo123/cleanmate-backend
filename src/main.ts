import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configuredOrigins =
    process.env.CORS_ORIGIN?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const devLanOrigin = /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3000$/;
  const corsOrigins =
    process.env.NODE_ENV === 'production'
      ? configuredOrigins.length > 0
        ? configuredOrigins
        : ['http://localhost:3000']
      : [
          ...(configuredOrigins.length > 0
            ? configuredOrigins
            : ['http://localhost:3000']),
          'http://127.0.0.1:3000',
          devLanOrigin,
        ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
