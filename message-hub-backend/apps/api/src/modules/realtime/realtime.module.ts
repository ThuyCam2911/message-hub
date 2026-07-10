import { Module } from '@nestjs/common';
import { RealtimeEventsSubscriber } from '@message-hub/shared';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway, RealtimeEventsSubscriber],
})
export class RealtimeModule {}
