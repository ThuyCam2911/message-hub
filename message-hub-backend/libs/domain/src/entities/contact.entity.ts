import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { ContactIdentifier } from './contact-identifier.entity';

@Entity('contacts')
export class Contact extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'external_ref', nullable: true })
  externalRef?: string;

  @Column({ name: 'display_name' })
  displayName!: string;

  @Column({ type: 'jsonb', default: {} })
  attributes!: Record<string, unknown>;

  @OneToMany(() => ContactIdentifier, (i) => i.contact)
  identifiers?: ContactIdentifier[];
}
