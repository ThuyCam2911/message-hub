import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStrategy, ChannelType } from '@message-hub/domain';
import { EncryptionService } from '@message-hub/shared';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { isForeignKeyViolation } from '../../common/db-errors';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelStrategyDto } from './dto/create-channel-strategy.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { UpdateChannelStrategyDto } from './dto/update-channel-strategy.dto';

export interface ChannelView {
  id: string;
  channelType: string;
  name: string;
  provider: string;
  isActive: boolean;
  configPreview: string;
  strategies: { id: string; strategyKey: string; adapterName: string; isActive: boolean }[];
}

export interface ZaloTemplateSummary {
  templateId: string;
  templateName: string;
  status: string;
}

/** Hard-delete when nothing references the row yet; otherwise fall back to deactivating it so history stays intact. */
export interface MutationOutcome {
  deleted: boolean;
  deactivated: boolean;
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

  async update(id: string, dto: UpdateChannelDto): Promise<ChannelView> {
    const channel = await this.findOrThrow(id);
    const patch: Partial<Channel> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.provider !== undefined) patch.provider = dto.provider;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.config !== undefined) {
      const existing = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
      patch.configEncrypted = this.encryption.encrypt({ ...existing, ...dto.config });
    }
    if (Object.keys(patch).length > 0) {
      await this.channels.update(id, patch);
    }
    return this.get(id);
  }

  /** Cascades to the channel's strategies; falls back to deactivating if any of them has attempts/policy steps referencing it. */
  async remove(id: string): Promise<MutationOutcome> {
    await this.findOrThrow(id);
    try {
      await this.channels.delete(id);
      return { deleted: true, deactivated: false };
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      await this.channels.update(id, { isActive: false });
      return { deleted: false, deactivated: true };
    }
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

  async updateStrategy(channelId: string, strategyId: string, dto: UpdateChannelStrategyDto): Promise<ChannelStrategy> {
    const strategy = await this.findStrategyOrThrow(channelId, strategyId);
    const patch: Partial<ChannelStrategy> = {};
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.config !== undefined) {
      const existing = strategy.configEncrypted ? this.encryption.decrypt(strategy.configEncrypted) : {};
      patch.configEncrypted = this.encryption.encrypt({ ...existing, ...dto.config });
    }
    if (Object.keys(patch).length > 0) {
      await this.strategies.update(strategyId, patch);
    }
    return this.strategies.findOneByOrFail({ id: strategyId });
  }

  async removeStrategy(channelId: string, strategyId: string): Promise<MutationOutcome> {
    await this.findStrategyOrThrow(channelId, strategyId);
    try {
      await this.strategies.delete(strategyId);
      return { deleted: true, deactivated: false };
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      await this.strategies.update(strategyId, { isActive: false });
      return { deleted: false, deactivated: true };
    }
  }

  async testStrategyConnection(strategyId: string): Promise<{ valid: boolean; error?: string }> {
    const strategy = await this.strategies.findOneByOrFail({ id: strategyId });
    const channel = await this.findOrThrow(strategy.channelId);
    const adapter = this.registry.get(strategy.strategyKey);
    const config = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    return adapter.validateConfig(config);
  }

  /** Zalo ZNS keeps its own approved-template registry — fetch it live so users pick a real templateId instead of typing one by hand. */
  async listZaloTemplates(channelId: string): Promise<ZaloTemplateSummary[]> {
    const channel = await this.findOrThrow(channelId);
    if (channel.channelType !== ChannelType.ZBS) {
      throw new BadRequestException('Sync template chỉ áp dụng cho channel loại zbs (Zalo)');
    }
    const adapter = this.registry.get('zbs_phone');
    if (!adapter.listTemplates) {
      throw new BadRequestException('Adapter zbs_phone hiện chưa hỗ trợ sync template');
    }
    if (!channel.configEncrypted) {
      throw new BadRequestException('Channel chưa có access token — hãy cấu hình channel trước khi sync template');
    }
    const config = this.encryption.decrypt(channel.configEncrypted);
    try {
      return await adapter.listTemplates(config);
    } catch (err) {
      // Surface Zalo's actual error (e.g. invalid/expired access token) instead of a generic 500.
      throw new BadRequestException(`Zalo API lỗi: ${(err as Error).message}`);
    }
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

  private async findStrategyOrThrow(channelId: string, strategyId: string): Promise<ChannelStrategy> {
    await this.findOrThrow(channelId); // ensures channel belongs to org
    const strategy = await this.strategies.findOne({ where: { id: strategyId, channelId } });
    if (!strategy) throw new NotFoundException(`Strategy ${strategyId} not found on channel ${channelId}`);
    return strategy;
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
