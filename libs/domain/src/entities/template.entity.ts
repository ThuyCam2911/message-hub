import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { TemplateApprovalStatus } from '../enums/message-status.enum';

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

  /**
   * Which channel this template was submitted/synced through — set when
   * created via a specific channel's provider (e.g. WhatsApp submission,
   * Zalo sync). No FK/relation on purpose: deleting the channel later
   * shouldn't cascade into (or be blocked by) templates that already exist.
   */
  @Column({ name: 'source_channel_id', type: 'uuid', nullable: true })
  sourceChannelId?: string;

  /** The provider's own template identifier (Zalo ZNS templateId, WhatsApp template name) — used to match on re-sync. */
  @Column({ name: 'provider_template_id', nullable: true })
  providerTemplateId?: string;

  @Column({
    type: 'enum',
    enum: TemplateApprovalStatus,
    name: 'approval_status',
    default: TemplateApprovalStatus.NOT_REQUIRED,
  })
  approvalStatus!: TemplateApprovalStatus;

  /** Free-text status/reason as reported by the provider (e.g. Zalo's raw status string, Meta's rejected_reason). */
  @Column({ name: 'approval_detail', nullable: true })
  approvalDetail?: string;
}
