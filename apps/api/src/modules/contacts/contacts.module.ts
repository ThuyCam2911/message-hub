import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, ContactIdentifier } from '@message-hub/domain';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChannelsModule } from '../channels/channels.module';
import { ContactsService } from './contacts.service';
import { ContactsImportService } from './contacts-import.service';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactIdentifier]), OrganizationsModule, AuditLogModule, ChannelsModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsImportService],
  exports: [ContactsService],
})
export class ContactsModule {}
