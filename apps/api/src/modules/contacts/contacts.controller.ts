import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AddIdentifierDto } from './dto/add-identifier.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Get()
  list() {
    return this.contacts.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.contacts.get(id);
  }

  @Post(':id/identifiers')
  addIdentifier(@Param('id') id: string, @Body() dto: AddIdentifierDto) {
    return this.contacts.addIdentifier(id, dto);
  }
}
