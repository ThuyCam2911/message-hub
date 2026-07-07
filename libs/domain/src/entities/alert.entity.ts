import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ChannelStrategy } from './channel-strategy.entity';

export enum AlertSeverity {
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/** Raised by the alerting cron when a channel_strategy's rolling failure rate crosses a threshold. */
@Entity('alerts')
export class Alert extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @Column({ name: 'channel_strategy_id' })
  channelStrategyId!: string;

  @ManyToOne(() => ChannelStrategy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_strategy_id' })
  channelStrategy?: ChannelStrategy;

  @Column({ type: 'enum', enum: AlertSeverity, default: AlertSeverity.WARNING })
  severity!: AlertSeverity;

  @Column()
  message!: string;

  @Column({ name: 'failure_rate', type: 'float' })
  failureRate!: number;

  @Column({ name: 'sample_size' })
  sampleSize!: number;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt?: Date;
}
