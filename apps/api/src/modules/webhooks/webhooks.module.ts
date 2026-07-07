import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { FailoverEngineModule } from '@message-hub/failover';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), AdaptersModule, FailoverEngineModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
