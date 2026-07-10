import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { MessageRequest } from './message-request.entity';
import { FailoverPolicyStep } from './failover-policy-step.entity';
import { ChannelStrategy } from './channel-strategy.entity';
import { MessageAttemptStatus } from '../enums/message-status.enum';

/** Immutable history row: one attempt at one failover step. */
@Entity('message_attempts')
export class MessageAttempt extends BaseEntity {
  @Column({ name: 'message_request_id' })
  @Index()
  messageRequestId!: string;

  @ManyToOne(() => MessageRequest, (r) => r.attempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_request_id' })
  messageRequest?: MessageRequest;

  @Column({ name: 'failover_policy_step_id' })
  failoverPolicyStepId!: string;

  @ManyToOne(() => FailoverPolicyStep, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'failover_policy_step_id' })
  failoverPolicyStep?: FailoverPolicyStep;

  @Column({ name: 'channel_strategy_id' })
  channelStrategyId!: string;

  @ManyToOne(() => ChannelStrategy, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'channel_strategy_id' })
  channelStrategy?: ChannelStrategy;

  @Column({ name: 'attempt_number', default: 1 })
  attemptNumber!: number;

  @Column({ type: 'enum', enum: MessageAttemptStatus, default: MessageAttemptStatus.QUEUED })
  @Index()
  status!: MessageAttemptStatus;

  @Column({ name: 'provider_message_id', nullable: true })
  @Index()
  providerMessageId?: string;

  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse?: Record<string, unknown>;

  @Column({ name: 'error_code', nullable: true })
  errorCode?: string;

  @Column({ name: 'error_message', nullable: true })
  errorMessage?: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ name: 'status_updated_at', type: 'timestamptz', nullable: true })
  statusUpdatedAt?: Date;

  @Column({ name: 'timeout_at', type: 'timestamptz', nullable: true })
  timeoutAt?: Date;

  /** BullMQ delayed job id for the pending timeout-check, so it can be cancelled
   *  when a webhook resolves the attempt before the timeout fires. */
  @Column({ name: 'timeout_job_id', nullable: true })
  timeoutJobId?: string;
}
