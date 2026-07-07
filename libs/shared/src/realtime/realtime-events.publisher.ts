import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REALTIME_EVENTS_CHANNEL, RealtimeEvent } from './realtime-events.types';

/**
 * Thin Redis pub/sub publisher so the worker process (where the failover
 * engine runs) can notify the API process (where the WS gateway lives)
 * without them sharing memory. Uses its own Redis connection, separate from
 * BullMQ's queue connections.
 */
@Injectable()
export class RealtimeEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.client.publish(REALTIME_EVENTS_CHANNEL, JSON.stringify(event));
  }
}
