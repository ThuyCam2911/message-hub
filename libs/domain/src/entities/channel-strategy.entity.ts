import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Channel } from './channel.entity';

/**
 * A channel can expose more than one send strategy (e.g. Zalo channel ->
 * `zbs_uid` and `zbs_phone`). `strategyKey` maps 1:1 to a registered
 * ChannelAdapter in the adapter registry.
 */
@Entity('channel_strategies')
export class ChannelStrategy extends BaseEntity {
  @Column({ name: 'channel_id' })
  @Index()
  channelId!: string;

  @ManyToOne(() => Channel, (c) => c.strategies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel?: Channel;

  @Column({ name: 'strategy_key' })
  strategyKey!: string;

  @Column({ name: 'adapter_name' })
  adapterName!: string;

  @Column({ name: 'config_encrypted', type: 'text', nullable: true })
  configEncrypted!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
