import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Organization } from './organization.entity';
import { UserRole } from '../enums/user-role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'organization_id' })
  @Index()
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.OPERATOR })
  role!: UserRole;
}
