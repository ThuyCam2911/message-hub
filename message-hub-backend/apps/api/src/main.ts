import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true keeps req.rawBody available alongside normal JSON parsing —
  // needed to verify Meta's X-Hub-Signature-256 HMAC over the exact bytes sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Restrict to the actual dashboard origin — the browser sends this Origin
  // header regardless of how the API/frontend containers reach each other
  // internally, so this is the same value whether running on the host or in
  // Docker Compose.
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Message Hub API listening on port ${port}`);
}

bootstrap();
