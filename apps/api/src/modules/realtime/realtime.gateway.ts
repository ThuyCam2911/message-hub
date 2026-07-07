import { OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { RealtimeEventsSubscriber } from '@message-hub/shared';

/**
 * Forwards Redis pub/sub events (published by the failover engine, which
 * runs in the separate worker process) to connected dashboard clients over
 * Socket.IO, so the Messages page updates live instead of only polling.
 */
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' } })
export class RealtimeGateway implements OnModuleInit {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly subscriber: RealtimeEventsSubscriber) {}

  onModuleInit() {
    this.subscriber.onEvent((event) => {
      this.server.emit(event.type, event);
    });
  }
}
