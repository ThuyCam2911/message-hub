import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  Channel,
  ChannelStrategy,
  ContactIdentifier,
  FailoverPolicyStep,
  MessageAttempt,
  MessageRequest,
  Template,
} from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { EncryptionService, RealtimeEventsPublisher, TemplateRenderer } from '@message-hub/shared';
import { FailoverEngineService } from './failover-engine.service';
import { QUEUE_ATTEMPT, QUEUE_TIMEOUT_CHECK } from './queue-names';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessageRequest,
      MessageAttempt,
      FailoverPolicyStep,
      ChannelStrategy,
      Channel,
      ContactIdentifier,
      Template,
    ]),
    BullModule.registerQueue({ name: QUEUE_ATTEMPT }, { name: QUEUE_TIMEOUT_CHECK }),
    AdaptersModule,
  ],
  providers: [FailoverEngineService, EncryptionService, TemplateRenderer, RealtimeEventsPublisher],
  exports: [FailoverEngineService],
})
export class FailoverEngineModule {}
