import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelType, Contact, ContactIdentifier } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { ChannelsService } from '../channels/channels.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AddIdentifierDto } from './dto/add-identifier.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(ContactIdentifier) private readonly identifiers: Repository<ContactIdentifier>,
    private readonly orgs: OrganizationsService,
    private readonly channels: ChannelsService,
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

  /**
   * Insert-or-update by the (contactId, channelType, identifierKind) unique
   * constraint — used by opt-in webhooks (e.g. TelegramWebhookController)
   * capturing a real chat_id/user_id from the provider, which should always
   * win over anything typed in manually before the contact ever opted in.
   */
  async upsertIdentifier(contactId: string, channelType: ChannelType, identifierKind: string, value: string) {
    const existing = await this.identifiers.findOne({ where: { contactId, channelType, identifierKind } });
    if (existing) {
      await this.identifiers.update(existing.id, { value, isVerified: true });
      return { ...existing, value, isVerified: true };
    }
    return this.identifiers.save(
      this.identifiers.create({ contactId, channelType, identifierKind, value, isVerified: true }),
    );
  }

  /** Builds the opt-in link for a contact to click (see ChannelsService.getInviteLink) — the contact's own id is the round-trip payload. */
  async getInviteLink(contactId: string, channelId: string): Promise<string> {
    await this.get(contactId);
    return this.channels.getInviteLink(channelId, contactId);
  }
}
