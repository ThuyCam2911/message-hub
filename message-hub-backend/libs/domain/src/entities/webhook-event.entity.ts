import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ChannelType } from '../enums/channel-type.enum';
import { MessageAttempt } from './message-attempt.entity';

/** Immutable audit log of every inbound webhook, matched or not. */
@Entity('webhook_events')
export class WebhookEvent extends BaseEntity {
  @Column({ name: 'channel_id', nullable: true })
  channelId?: string;

  @Column({ type: 'enum', enum: ChannelType, name: 'channel_type' })
  @Index()
  channelType!: ChannelType;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: unknown;

  @Column({ name: 'signature_valid', default: false })
  signatureValid!: boolean;

  @Column({ name: 'matched_attempt_id', nullable: true })
  matchedAttemptId?: string;

  @ManyToOne(() => MessageAttempt, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'matched_attempt_id' })
  matchedAttempt?: MessageAttempt;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt!: Date;
}
