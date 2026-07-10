import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Contact } from './contact.entity';
import { ChannelType } from '../enums/channel-type.enum';

/** One contact can have many channel identities (Zalo UID, phone, telegram chat id...). */
@Entity('contact_identifiers')
@Unique(['contactId', 'channelType', 'identifierKind'])
export class ContactIdentifier extends BaseEntity {
  @Column({ name: 'contact_id' })
  @Index()
  contactId!: string;

  @ManyToOne(() => Contact, (c) => c.identifiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact?: Contact;

  @Column({ type: 'enum', enum: ChannelType, name: 'channel_type' })
  channelType!: ChannelType;

  /** e.g. 'uid' | 'phone' | 'chat_id' | 'email' */
  @Column({ name: 'identifier_kind' })
  identifierKind!: string;

  @Column()
  value!: string;

  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;
}
