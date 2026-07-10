import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { Contact } from './contact.entity';
import { Template } from './template.entity';
import { FailoverPolicy } from './failover-policy.entity';
import { Campaign } from './campaign.entity';
import { ChannelStrategy } from './channel-strategy.entity';
import { MessageRequestStatus } from '../enums/message-status.enum';
import { MessageAttempt } from './message-attempt.entity';

/** One unit of work: "send this template to this contact via this failover policy". */
@Entity('message_requests')
export class MessageRequest extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'campaign_id', nullable: true })
  campaignId?: string;

  @ManyToOne(() => Campaign, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ name: 'contact_id' })
  contactId!: string;

  @ManyToOne(() => Contact, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contact_id' })
  contact?: Contact;

  @Column({ name: 'template_id' })
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'template_id' })
  template?: Template;

  @Column({ name: 'failover_policy_id' })
  failoverPolicyId!: string;

  @ManyToOne(() => FailoverPolicy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'failover_policy_id' })
  failoverPolicy?: FailoverPolicy;

  @Column({ name: 'template_variables', type: 'jsonb', default: {} })
  templateVariables!: Record<string, unknown>;

  @Column({ type: 'enum', enum: MessageRequestStatus, default: MessageRequestStatus.PENDING })
  status!: MessageRequestStatus;

  @Column({ name: 'current_step_order', nullable: true })
  currentStepOrder?: number;

  @Column({ name: 'final_channel_strategy_id', nullable: true })
  finalChannelStrategyId?: string;

  @ManyToOne(() => ChannelStrategy, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'final_channel_strategy_id' })
  finalChannelStrategy?: ChannelStrategy;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @OneToMany(() => MessageAttempt, (a) => a.messageRequest)
  attempts?: MessageAttempt[];
}
