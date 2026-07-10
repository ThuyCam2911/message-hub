import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { ChannelStrategy } from './channel-strategy.entity';

@Entity('channels')
export class Channel extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'enum', enum: ChannelType, name: 'channel_type' })
  channelType!: ChannelType;

  @Column()
  name!: string;

  @Column()
  provider!: string;

  /** Encrypted JSON blob (see EncryptionService) holding provider credentials. */
  @Column({ name: 'config_encrypted', type: 'text', nullable: true })
  configEncrypted!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => ChannelStrategy, (s) => s.channel)
  strategies?: ChannelStrategy[];
}
