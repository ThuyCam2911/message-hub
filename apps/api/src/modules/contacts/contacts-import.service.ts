import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { ChannelType, Contact, ContactIdentifier } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * Column name -> (channelType, identifierKind). Explicit rather than a
 * generic "phone"/"id" column because the same raw value (e.g. a phone
 * number) can back multiple, differently-routed identifiers (sms vs zbs vs
 * whatsapp) — the CSV has to say which one it means.
 */
const IDENTIFIER_COLUMNS: Record<string, { channelType: ChannelType; identifierKind: string }> = {
  email: { channelType: ChannelType.EMAIL, identifierKind: 'email' },
  sms_phone: { channelType: ChannelType.SMS, identifierKind: 'phone' },
  zbs_phone: { channelType: ChannelType.ZBS, identifierKind: 'phone' },
  zbs_uid: { channelType: ChannelType.ZBS, identifierKind: 'uid' },
  whatsapp_phone: { channelType: ChannelType.WHATSAPP, identifierKind: 'phone' },
  telegram_chat_id: { channelType: ChannelType.TELEGRAM, identifierKind: 'chat_id' },
  line_user_id: { channelType: ChannelType.LINE, identifierKind: 'user_id' },
};

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  totalRows: number;
  created: number;
  errors: ImportRowError[];
}

@Injectable()
export class ContactsImportService {
  constructor(
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(ContactIdentifier) private readonly identifiers: Repository<ContactIdentifier>,
    private readonly orgs: OrganizationsService,
  ) {}

  async importCsv(buffer: Buffer): Promise<ImportResult> {
    let records: Record<string, string>[];
    try {
      records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err) {
      return { totalRows: 0, created: 0, errors: [{ row: 0, message: `Failed to parse CSV: ${(err as Error).message}` }] };
    }

    const errors: ImportRowError[] = [];
    let created = 0;
    const organizationId = this.orgs.getDefaultOrganizationId();

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // account for header row + 1-indexing

      if (!row.displayName?.trim()) {
        errors.push({ row: rowNumber, message: 'displayName is required' });
        continue;
      }

      const identifierEntries = Object.entries(IDENTIFIER_COLUMNS)
        .filter(([column]) => row[column]?.trim())
        .map(([column, spec]) => ({ ...spec, value: row[column].trim(), column }));

      if (identifierEntries.length === 0) {
        errors.push({
          row: rowNumber,
          message: `No identifier columns found (expected at least one of: ${Object.keys(IDENTIFIER_COLUMNS).join(', ')})`,
        });
        continue;
      }

      try {
        const contact = await this.contacts.save(
          this.contacts.create({
            organizationId,
            displayName: row.displayName.trim(),
            externalRef: row.externalRef?.trim() || undefined,
            attributes: {},
          }),
        );
        for (const entry of identifierEntries) {
          await this.identifiers.save(
            this.identifiers.create({
              contactId: contact.id,
              channelType: entry.channelType,
              identifierKind: entry.identifierKind,
              value: entry.value,
              isVerified: false,
            }),
          );
        }
        created++;
      } catch (err) {
        errors.push({ row: rowNumber, message: (err as Error).message });
      }
    }

    return { totalRows: records.length, created, errors };
  }
}
