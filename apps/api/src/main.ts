import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const e = env();
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  if (expressApp && typeof expressApp.set === 'function') {
    expressApp.set('trust proxy', 1);
  }
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  const allowedOrigins = Array.from(
    new Set(
      [
        e.APP_URL,
        'https://pastimurahnya.my.id',
        'https://www.pastimurahnya.my.id',
        'http://pastimurahnya.my.id',
        'http://www.pastimurahnya.my.id',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ].filter(Boolean),
    ),
  );
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  });

  await app.listen(e.API_PORT);
  console.warn(`API listening on http://localhost:${e.API_PORT}`);
}

void bootstrap();

