import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { getDatabaseConfig } from './config/database.config';
import { getBullConnection } from './config/bullmq.config';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { FailoverPoliciesModule } from './modules/failover-policies/failover-policies.module';
import { MessageRequestsModule } from './modules/message-requests/message-requests.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    BullModule.forRoot({ connection: getBullConnection() }),
    OrganizationsModule,
    ChannelsModule,
    TemplatesModule,
    ContactsModule,
    FailoverPoliciesModule,
    MessageRequestsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
