import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.disable('x-powered-by');
  const origins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: origins?.length ? origins : true,
    allowedHeaders: ['Content-Type', 'x-app-token'],
  });
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
