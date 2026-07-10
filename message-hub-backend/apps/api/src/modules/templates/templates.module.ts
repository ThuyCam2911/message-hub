import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from '@message-hub/domain';
import { TemplateRenderer } from '@message-hub/shared';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChannelsModule } from '../channels/channels.module';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Template]), OrganizationsModule, AuditLogModule, ChannelsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplateRenderer],
  exports: [TemplatesService],
})
export class TemplatesModule {}
