import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateChannelStrategyDto } from './dto/create-channel-strategy.dto';

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
  @Post(':id/strategies')
  async addStrategy(@Param('id') id: string, @Body() dto: CreateChannelStrategyDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.channels.addStrategy(id, dto);
    this.auditLog.record(user.id, 'channel_strategy.created', 'ChannelStrategy', result.id, {
      strategyKey: dto.strategyKey,
    });
    return result;
  }

  @Roles(UserRole.ADMIN)
  @Post('strategies/:strategyId/test-connection')
  testConnection(@Param('strategyId') strategyId: string) {
    return this.channels.testStrategyConnection(strategyId);
  }
}
