import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const e = env();
  const app = await NestFactory.create(AppModule);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: [e.APP_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  await app.listen(e.API_PORT);
  console.warn(`API listening on http://localhost:${e.API_PORT}`);
}

void bootstrap();

