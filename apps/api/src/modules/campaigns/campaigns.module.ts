import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign, Contact, MessageRequest } from '@message-hub/domain';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MessageRequestsModule } from '../message-requests/message-requests.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, Contact, MessageRequest]),
    OrganizationsModule,
    AuditLogModule,
    MessageRequestsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
