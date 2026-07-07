import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { ChannelType } from '../enums/channel-type.enum';

@Entity('templates')
export class Template extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: ChannelType, name: 'channel_type' })
  channelType!: ChannelType;

  @Column({ type: 'jsonb' })
  body!: Record<string, unknown> | string;

  @Column({ type: 'jsonb', default: [] })
  variables!: string[];

  @Column({ default: 1 })
  version!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
