import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ContactsService } from './contacts.service';
import { ContactsImportService } from './contacts-import.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AddIdentifierDto } from './dto/add-identifier.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly contactsImport: ContactsImportService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.contactsImport.importCsv(file.buffer);
    this.auditLog.record(user.id, 'contacts.imported', 'Contact', 'bulk', {
      totalRows: result.totalRows,
      created: result.created,
      errorCount: result.errors.length,
    });
    return result;
  }

  @Get()
  list() {
    return this.contacts.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.contacts.get(id);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/identifiers')
  addIdentifier(@Param('id') id: string, @Body() dto: AddIdentifierDto) {
    return this.contacts.addIdentifier(id, dto);
  }
}
