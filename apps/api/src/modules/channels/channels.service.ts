import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStrategy, ChannelType } from '@message-hub/domain';
import { EncryptionService } from '@message-hub/shared';
import { ChannelAdapter, ChannelAdapterRegistry } from '@message-hub/adapters';
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
    // strategyConfigOverride() resolves by (channelId, strategyKey) — a duplicate
    // strategyKey on the same channel would make that lookup ambiguous.
    const existing = await this.strategies.findOne({ where: { channelId, strategyKey: dto.strategyKey } });
    if (existing) {
      throw new BadRequestException(`Channel đã có strategy dùng "${dto.strategyKey}" rồi — sửa strategy đó thay vì thêm mới.`);
    }
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
    const channelConfig = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    const strategyConfig = strategy.configEncrypted ? this.encryption.decrypt(strategy.configEncrypted) : {};
    // Same merge as FailoverEngineService.executeStep — otherwise "Test
    // connection" validates the channel-level config only and can report
    // success (or a stale failure) while ignoring a strategy-level override
    // the user just saved.
    return adapter.validateConfig({ ...channelConfig, ...strategyConfig });
  }

  /** Zalo ZNS keeps its own approved-template registry — fetch it live so users pick a real templateId instead of typing one by hand. */
  async listZaloTemplates(channelId: string): Promise<ZaloTemplateSummary[]> {
    const channel = await this.findOrThrow(channelId);
    if (channel.channelType !== ChannelType.ZBS) {
      throw new BadRequestException('Sync template chỉ áp dụng cho channel loại zbs (Zalo)');
    }
    return this.listProviderTemplatesForChannel(channel);
  }

  /**
   * Generic version of listZaloTemplates: works for any channel whose
   * channelType has an adapter implementing `listTemplates` (currently only
   * zbs_phone, but written so a future SMS/WhatsApp provider with its own
   * template registry needs zero changes here). Deliberately resolves the
   * adapter by channelType via the registry rather than requiring the
   * channel to already have a matching channel_strategy row — the call only
   * ever needs the channel-level config + the adapter class, both of which
   * exist independent of whether a strategy has been added to this channel
   * yet.
   */
  async listProviderTemplates(channelId: string): Promise<ZaloTemplateSummary[]> {
    const channel = await this.findOrThrow(channelId);
    return this.listProviderTemplatesForChannel(channel);
  }

  private async listProviderTemplatesForChannel(channel: Channel): Promise<ZaloTemplateSummary[]> {
    const adapter = this.findAdapterWithCapability(channel.channelType, 'listTemplates');
    if (!channel.configEncrypted) {
      throw new BadRequestException('Channel chưa có access token — hãy cấu hình channel trước khi sync template');
    }
    const config = this.encryption.decrypt(channel.configEncrypted);
    // Refresh operates on the pure channel-level config and writes back to
    // channel.config_encrypted only (same as FailoverEngineService.refreshChannelCredentialsIfNeeded)
    // — a strategy-level override, if any, is merged in afterwards for the actual call.
    if (adapter.refreshCredentials) {
      try {
        const refreshed = await adapter.refreshCredentials(config);
        if (refreshed) {
          Object.assign(config, refreshed);
          await this.channels.update(channel.id, { configEncrypted: this.encryption.encrypt(config) });
        }
      } catch (err) {
        // Non-fatal — fall through with the existing token and let the actual sync call below surface the real error.
      }
    }
    const mergedConfig = { ...config, ...(await this.strategyConfigOverride(channel.id, adapter.strategyKey)) };
    try {
      return await adapter.listTemplates(mergedConfig);
    } catch (err) {
      throw new BadRequestException(`${adapter.strategyKey} API lỗi: ${(err as Error).message}`);
    }
  }

  /**
   * Pushes a newly-authored template to the provider for approval, for
   * channels whose channelType has an adapter implementing `submitTemplate`
   * (currently only whatsapp_cloud — Zalo ZNS has no public submission API,
   * only listProviderTemplates for syncing already-approved ones).
   */
  async submitProviderTemplate(
    channelId: string,
    template: { name: string; body: Record<string, unknown> | string; variables: string[] },
  ): Promise<{ providerTemplateId: string; status: string }> {
    const channel = await this.findOrThrow(channelId);
    const adapter = this.findAdapterWithCapability(channel.channelType, 'submitTemplate');
    if (!channel.configEncrypted) {
      throw new BadRequestException('Channel chưa có cấu hình — hãy thiết lập channel trước khi submit template');
    }
    const config = this.encryption.decrypt(channel.configEncrypted);
    const mergedConfig = { ...config, ...(await this.strategyConfigOverride(channel.id, adapter.strategyKey)) };
    try {
      return await adapter.submitTemplate(mergedConfig, template);
    } catch (err) {
      throw new BadRequestException(`Submit template thất bại: ${(err as Error).message}`);
    }
  }

  /**
   * Builds the opt-in link a contact needs to click before the channel can
   * message them (Telegram bots, LINE OAs) — payload round-trips through
   * the provider's opt-in webhook so the resulting identifier lands on the
   * right contact. Channels without an opt-in model throw via
   * findAdapterWithCapability's usual "not supported" error.
   */
  async getInviteLink(channelId: string, payload: string): Promise<string> {
    const channel = await this.findOrThrow(channelId);
    const adapter = this.findAdapterWithCapability(channel.channelType, 'getInviteLink');
    if (!channel.configEncrypted) {
      throw new BadRequestException('Channel chưa có cấu hình — hãy thiết lập channel trước khi tạo invite link');
    }
    const config = this.encryption.decrypt(channel.configEncrypted);
    const mergedConfig = { ...config, ...(await this.strategyConfigOverride(channel.id, adapter.strategyKey)) };
    try {
      return await adapter.getInviteLink(mergedConfig, payload);
    } catch (err) {
      throw new BadRequestException(`Tạo invite link thất bại: ${(err as Error).message}`);
    }
  }

  /**
   * Same merge FailoverEngineService.executeStep and testStrategyConnection do —
   * a channelType-resolved adapter capability (listTemplates/submitTemplate/getInviteLink)
   * can still have a strategy-level config override sitting on the matching
   * channel_strategy row (matched by strategyKey), and ignoring it here was the
   * same bug class as the fixed send()-path one (see .claude/memory.md).
   */
  private async strategyConfigOverride(channelId: string, strategyKey: string): Promise<Record<string, unknown>> {
    const strategy = await this.strategies.findOne({ where: { channelId, strategyKey } });
    if (!strategy?.configEncrypted) return {};
    return this.encryption.decrypt(strategy.configEncrypted);
  }

  /**
   * Resolves an adapter for a capability by channelType, not by an existing
   * channel_strategy row — sync/submit only need the channel-level config +
   * the adapter class, so requiring a strategy to already be saved on the
   * channel would be an artificial precondition the actual call doesn't need.
   */
  private findAdapterWithCapability<K extends 'listTemplates' | 'submitTemplate' | 'getInviteLink'>(
    channelType: ChannelType,
    capability: K,
  ): ChannelAdapter & Required<Pick<ChannelAdapter, K>> {
    for (const adapter of this.registry.list()) {
      if (adapter.channelType === channelType && adapter[capability]) {
        return adapter as ChannelAdapter & Required<Pick<ChannelAdapter, K>>;
      }
    }
    throw new BadRequestException(
      `Không có adapter nào cho channel loại ${channelType} hỗ trợ ${capability} (vd Zalo ZNS không có API submit — chỉ có thể sync template đã duyệt).`,
    );
  }

  /**
   * Full config for the edit form, with secret fields (per the matching
   * adapters' getConfigSchema) revealed except their last 4 characters —
   * lets the user see what's already configured without ever round-tripping
   * a complete credential to the browser.
   */
  async getConfigForEdit(id: string): Promise<Record<string, unknown>> {
    const channel = await this.findOrThrow(id);
    if (!channel.configEncrypted) return {};
    const config = this.encryption.decrypt(channel.configEncrypted);
    const secretKeys = this.secretKeysForChannelType(channel.channelType);
    return this.encryption.maskSecretFields(config, secretKeys);
  }

  async getStrategyConfigForEdit(channelId: string, strategyId: string): Promise<Record<string, unknown>> {
    const strategy = await this.findStrategyOrThrow(channelId, strategyId);
    if (!strategy.configEncrypted) return {};
    const config = this.encryption.decrypt(strategy.configEncrypted);
    const adapter = this.registry.get(strategy.strategyKey);
    const secretKeys = new Set(
      Object.entries(adapter.getConfigSchema().properties)
        .filter(([, prop]) => prop.secret)
        .map(([key]) => key),
    );
    return this.encryption.maskSecretFields(config, secretKeys);
  }

  private secretKeysForChannelType(channelType: string): Set<string> {
    const secretKeys = new Set<string>();
    for (const adapter of this.registry.list()) {
      if (adapter.channelType !== channelType) continue;
      for (const [key, prop] of Object.entries(adapter.getConfigSchema().properties)) {
        if (prop.secret) secretKeys.add(key);
      }
    }
    return secretKeys;
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
