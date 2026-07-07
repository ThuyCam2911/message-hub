import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { REALTIME_EVENTS_CHANNEL, RealtimeEvent } from './realtime-events.types';

/** Subscribes to the same Redis channel RealtimeEventsPublisher writes to. */
@Injectable()
export class RealtimeEventsSubscriber implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private readonly emitter = new EventEmitter();

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
    this.client.subscribe(REALTIME_EVENTS_CHANNEL);
    this.client.on('message', (_channel: string, message: string) => {
      try {
        this.emitter.emit('event', JSON.parse(message) as RealtimeEvent);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  onEvent(handler: (event: RealtimeEvent) => void): void {
    this.emitter.on('event', handler);
  }
}
