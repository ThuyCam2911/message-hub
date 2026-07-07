import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactIdentifier } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AddIdentifierDto } from './dto/add-identifier.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(ContactIdentifier) private readonly identifiers: Repository<ContactIdentifier>,
    private readonly orgs: OrganizationsService,
  ) {}

  create(dto: CreateContactDto) {
    return this.contacts.save(
      this.contacts.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        displayName: dto.displayName,
        externalRef: dto.externalRef,
        attributes: dto.attributes ?? {},
      }),
    );
  }

  list() {
    return this.contacts.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const contact = await this.contacts.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    const identifiers = await this.identifiers.find({ where: { contactId: id } });
    return { ...contact, identifiers };
  }

  async addIdentifier(contactId: string, dto: AddIdentifierDto) {
    await this.get(contactId);
    return this.identifiers.save(
      this.identifiers.create({
        contactId,
        channelType: dto.channelType,
        identifierKind: dto.identifierKind,
        value: dto.value,
        isVerified: false,
      }),
    );
  }
}
