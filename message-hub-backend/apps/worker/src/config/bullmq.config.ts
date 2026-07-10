import { QueueOptions } from 'bullmq';

export function getBullConnection(): QueueOptions['connection'] {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}
