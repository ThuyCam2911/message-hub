import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @Column({ name: 'actor_user_id', nullable: true })
  actorUserId?: string;

  @Column()
  action!: string;

  @Column({ name: 'entity_type' })
  entityType!: string;

  @Column({ name: 'entity_id' })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  diff?: unknown;
}
