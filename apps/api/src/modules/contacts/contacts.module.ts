import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, ContactIdentifier } from '@message-hub/domain';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ContactsService } from './contacts.service';
import { ContactsImportService } from './contacts-import.service';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contact, ContactIdentifier]), OrganizationsModule, AuditLogModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsImportService],
  exports: [ContactsService],
})
export class ContactsModule {}
