import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { getDatabaseConfig } from './config/database.config';
import { getBullConnection } from './config/bullmq.config';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { FailoverPoliciesModule } from './modules/failover-policies/failover-policies.module';
import { MessageRequestsModule } from './modules/message-requests/message-requests.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    BullModule.forRoot({ connection: getBullConnection() }),
    // Generous global default so normal dashboard usage never hits it;
    // /auth/login overrides this with a much stricter limit (see its @Throttle).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    OrganizationsModule,
    AuthModule,
    AuditLogModule,
    ChannelsModule,
    TemplatesModule,
    ContactsModule,
    FailoverPoliciesModule,
    MessageRequestsModule,
    WebhooksModule,
    RealtimeModule,
    AnalyticsModule,
    AlertsModule,
    CampaignsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
