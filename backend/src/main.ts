import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // FRONTEND_URL / DEPLOYED_FRONTEND_URL can each hold a single origin, or
  // multiple comma-separated origins (e.g. a local dev URL plus a Vercel
  // preview URL) — useful for testing branch previews without losing CORS
  // access from localhost.
  const allowedOrigins = [
    configService.get<string>('FRONTEND_URL'),
    configService.get<string>('DEPLOYED_FRONTEND_URL'),
  ]
    .filter((origin): origin is string => Boolean(origin))
    .flatMap((origin) => origin.split(',').map((o) => o.trim()))
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
  });

  await app.listen(configService.get<number>('PORT') ?? 4000);
}
bootstrap();
