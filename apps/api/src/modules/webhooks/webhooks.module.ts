import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, WebhookEvent } from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { FailoverEngineModule } from '@message-hub/failover';
import { EncryptionService } from '@message-hub/shared';
import { ContactsModule } from '../contacts/contacts.module';
import { WebhooksController } from './webhooks.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { ZaloWebhookController } from './zalo-webhook.controller';
import { LineWebhookController } from './line-webhook.controller';
import { WebhookProcessingService } from './webhook-processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent, Channel]), AdaptersModule, FailoverEngineModule, ContactsModule],
  controllers: [
    WebhooksController,
    WhatsappWebhookController,
    TelegramWebhookController,
    ZaloWebhookController,
    LineWebhookController,
  ],
  providers: [WebhookProcessingService, EncryptionService],
})
export class WebhooksModule {}
