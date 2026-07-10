import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { Template } from './template.entity';
import { FailoverPolicy } from './failover-policy.entity';

export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
}

@Entity('campaigns')
export class Campaign extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column()
  name!: string;

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

  @Column({ type: 'enum', enum: CampaignStatus, default: CampaignStatus.DRAFT })
  status!: CampaignStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt?: Date;
}
