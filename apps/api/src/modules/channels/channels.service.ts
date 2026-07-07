import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStrategy } from '@message-hub/domain';
import { EncryptionService } from '@message-hub/shared';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelStrategyDto } from './dto/create-channel-strategy.dto';

export interface ChannelView {
  id: string;
  channelType: string;
  name: string;
  provider: string;
  isActive: boolean;
  configPreview: string;
  strategies: { id: string; strategyKey: string; adapterName: string; isActive: boolean }[];
}

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(ChannelStrategy) private readonly strategies: Repository<ChannelStrategy>,
    private readonly orgs: OrganizationsService,
    private readonly encryption: EncryptionService,
    private readonly registry: ChannelAdapterRegistry,
  ) {}

  async create(dto: CreateChannelDto): Promise<ChannelView> {
    const channel = await this.channels.save(
      this.channels.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        channelType: dto.channelType,
        name: dto.name,
        provider: dto.provider,
        configEncrypted: this.encryption.encrypt(dto.config),
        isActive: true,
      }),
    );
    return this.toView(channel, []);
  }

  async list(): Promise<ChannelView[]> {
    const channels = await this.channels.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
    });
    const result: ChannelView[] = [];
    for (const channel of channels) {
      const strategies = await this.strategies.find({ where: { channelId: channel.id } });
      result.push(this.toView(channel, strategies));
    }
    return result;
  }

  async get(id: string): Promise<ChannelView> {
    const channel = await this.findOrThrow(id);
    const strategies = await this.strategies.find({ where: { channelId: channel.id } });
    return this.toView(channel, strategies);
  }

  async addStrategy(channelId: string, dto: CreateChannelStrategyDto): Promise<ChannelStrategy> {
    await this.findOrThrow(channelId); // ensures channel exists + belongs to org
    this.registry.get(dto.strategyKey); // throws if unknown strategyKey
    return this.strategies.save(
      this.strategies.create({
        channelId,
        strategyKey: dto.strategyKey,
        adapterName: dto.strategyKey,
        configEncrypted: dto.config ? this.encryption.encrypt(dto.config) : null,
        isActive: true,
      }),
    );
  }

  async testStrategyConnection(strategyId: string): Promise<{ valid: boolean; error?: string }> {
    const strategy = await this.strategies.findOneByOrFail({ id: strategyId });
    const channel = await this.findOrThrow(strategy.channelId);
    const adapter = this.registry.get(strategy.strategyKey);
    const config = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    return adapter.validateConfig(config);
  }

  listAvailableAdapters() {
    return this.registry.list().map((a) => ({
      strategyKey: a.strategyKey,
      channelType: a.channelType,
      identifierKind: a.identifierKind,
      configSchema: a.getConfigSchema(),
    }));
  }

  private async findOrThrow(id: string): Promise<Channel> {
    const channel = await this.channels.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    return channel;
  }

  private toView(channel: Channel, strategies: ChannelStrategy[]): ChannelView {
    return {
      id: channel.id,
      channelType: channel.channelType,
      name: channel.name,
      provider: channel.provider,
      isActive: channel.isActive,
      configPreview: channel.configEncrypted
        ? this.encryption.maskPreview(this.encryption.decrypt(channel.configEncrypted))
        : '',
      strategies: strategies.map((s) => ({
        id: s.id,
        strategyKey: s.strategyKey,
        adapterName: s.adapterName,
        isActive: s.isActive,
      })),
    };
  }
}
