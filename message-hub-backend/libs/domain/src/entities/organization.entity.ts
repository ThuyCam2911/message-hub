import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column()
  name!: string;
}
