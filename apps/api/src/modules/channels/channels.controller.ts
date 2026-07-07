import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelStrategyDto } from './dto/create-channel-strategy.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { UpdateChannelStrategyDto } from './dto/update-channel-strategy.dto';

// Channel credentials are the most sensitive config in the portal, so
// managing them (not just viewing) is admin-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('adapters')
  listAdapters() {
    return this.channels.listAvailableAdapters();
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Body() dto: CreateChannelDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.channels.create(dto);
    // Never log dto.config — it holds provider credentials.
    this.auditLog.record(user.id, 'channel.created', 'Channel', result.id, {
      channelType: dto.channelType,
      name: dto.name,
      provider: dto.provider,
    });
    return result;
  }

  @Get()
  list() {
    return this.channels.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.channels.get(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateChannelDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.channels.update(id, dto);
    this.auditLog.record(user.id, 'channel.updated', 'Channel', id, {
      name: dto.name,
      provider: dto.provider,
      isActive: dto.isActive,
      configChanged: !!dto.config,
    });
    return result;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.channels.remove(id);
    this.auditLog.record(user.id, result.deleted ? 'channel.deleted' : 'channel.deactivated', 'Channel', id, result);
    return result;
  }

  @Get(':id/zalo-templates')
  listZaloTemplates(@Param('id') id: string) {
    return this.channels.listZaloTemplates(id);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/strategies')
  async addStrategy(@Param('id') id: string, @Body() dto: CreateChannelStrategyDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.channels.addStrategy(id, dto);
    this.auditLog.record(user.id, 'channel_strategy.created', 'ChannelStrategy', result.id, {
      strategyKey: dto.strategyKey,
    });
    return result;
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/strategies/:strategyId')
  async updateStrategy(
    @Param('id') id: string,
    @Param('strategyId') strategyId: string,
    @Body() dto: UpdateChannelStrategyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.channels.updateStrategy(id, strategyId, dto);
    this.auditLog.record(user.id, 'channel_strategy.updated', 'ChannelStrategy', strategyId, {
      isActive: dto.isActive,
      configChanged: !!dto.config,
    });
    return result;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id/strategies/:strategyId')
  async removeStrategy(
    @Param('id') id: string,
    @Param('strategyId') strategyId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.channels.removeStrategy(id, strategyId);
    this.auditLog.record(
      user.id,
      result.deleted ? 'channel_strategy.deleted' : 'channel_strategy.deactivated',
      'ChannelStrategy',
      strategyId,
      result,
    );
    return result;
  }

  @Roles(UserRole.ADMIN)
  @Post('strategies/:strategyId/test-connection')
  testConnection(@Param('strategyId') strategyId: string) {
    return this.channels.testStrategyConnection(strategyId);
  }
}
