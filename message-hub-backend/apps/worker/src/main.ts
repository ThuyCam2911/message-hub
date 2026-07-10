import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule);
  // eslint-disable-next-line no-console
  console.log('Message Hub worker started, listening on dispatch/attempt/timeout-check queues');
}

bootstrap();
