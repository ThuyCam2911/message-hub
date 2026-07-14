import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { MessageAttempt } from './message-attempt.entity';

export enum TrackingEventType {
  VIEW = 'view',
  CLICK = 'click',
}

/**
 * One row per open-pixel hit or link click on a sent message. Attached to
 * the message_attempt that carried the link/pixel, not the message_request,
 * because a request can fail over across multiple attempts/channels and we
 * want to know exactly which delivery the user actually interacted with.
 */
@Entity('tracking_events')
export class TrackingEvent extends BaseEntity {
  @Column({ name: 'message_attempt_id' })
  @Index()
  messageAttemptId!: string;

  @ManyToOne(() => MessageAttempt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_attempt_id' })
  messageAttempt?: MessageAttempt;

  @Column({ type: 'enum', enum: TrackingEventType, name: 'event_type' })
  @Index()
  eventType!: TrackingEventType;

  /** Destination URL for click events; absent for view (open-pixel) events. */
  @Column({ type: 'text', nullable: true })
  url?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  /** SHA-256 of the requester IP — never store raw IPs for link-click logs. */
  @Column({ name: 'ip_hash', nullable: true })
  ipHash?: string;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;
}
