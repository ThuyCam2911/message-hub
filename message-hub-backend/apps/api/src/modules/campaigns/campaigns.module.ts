import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, ChannelStrategy, Contact, FailoverPolicyStep, MessageRequest } from '@message-hub/domain';
import { AdaptersModule } from '@message-hub/adapters';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MessageRequestsModule } from '../message-requests/message-requests.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, MessageRequest, FailoverPolicyStep, ChannelStrategy]),
    OrganizationsModule,
    AuditLogModule,
    MessageRequestsModule,
    ContactsModule,
    AdaptersModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
