import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, WebhookEvent } from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { FailoverEngineModule } from '@message-hub/failover';
import { EncryptionService } from '@message-hub/shared';
import { WebhooksController } from './webhooks.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WebhookProcessingService } from './webhook-processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent, Channel]), AdaptersModule, FailoverEngineModule],
  controllers: [WebhooksController, WhatsappWebhookController],
  providers: [WebhookProcessingService, EncryptionService],
})
export class WebhooksModule {}
