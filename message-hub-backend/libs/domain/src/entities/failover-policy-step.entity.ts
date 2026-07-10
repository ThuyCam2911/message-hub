import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { FailoverPolicy } from './failover-policy.entity';
import { ChannelStrategy } from './channel-strategy.entity';
import { AdvanceOn } from '../enums/message-status.enum';

@Entity('failover_policy_steps')
@Unique(['failoverPolicyId', 'stepOrder'])
export class FailoverPolicyStep extends BaseEntity {
  @Column({ name: 'failover_policy_id' })
  @Index()
  failoverPolicyId!: string;

  @ManyToOne(() => FailoverPolicy, (p) => p.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'failover_policy_id' })
  failoverPolicy?: FailoverPolicy;

  @Column({ name: 'step_order' })
  stepOrder!: number;

  @Column({ name: 'channel_strategy_id' })
  channelStrategyId!: string;

  @ManyToOne(() => ChannelStrategy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channel_strategy_id' })
  channelStrategy?: ChannelStrategy;

  @Column({ name: 'timeout_seconds', nullable: true })
  timeoutSeconds?: number;

  @Column({ type: 'enum', enum: AdvanceOn, name: 'advance_on', default: AdvanceOn.EITHER })
  advanceOn!: AdvanceOn;
}
