import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { MAX_UPLOAD_BYTES } from './modules/uploads/uploads.service';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  app.use('/uploads/put', raw({ type: '*/*', limit: MAX_UPLOAD_BYTES }));
  app.use(json({ limit: '1mb' }));
  app.enableCors({ origin: cfg.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const io = new RedisIoAdapter(app);
  io.connect();
  app.useWebSocketAdapter(io);

  app.enableShutdownHooks();
  await app.listen(cfg.PORT, '0.0.0.0');
}

void bootstrap();
