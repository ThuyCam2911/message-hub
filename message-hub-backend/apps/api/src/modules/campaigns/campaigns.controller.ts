import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { TriggerCampaignDto } from './dto/trigger-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SendCampaignTestDto } from './dto/send-campaign-test.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Get()
  list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.campaigns.list({ search, status, from, to });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Get(':id/message-requests')
  getMessageRequests(@Param('id') id: string) {
    return this.campaigns.getMessageRequests(id);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.campaigns.update(id, dto);
    this.auditLog.record(user.id, 'campaign.updated', 'Campaign', id, dto);
    return result;
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.campaigns.remove(id);
    this.auditLog.record(user.id, 'campaign.deleted', 'Campaign', id, {});
    return result;
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/send-test')
  async sendTest(@Param('id') id: string, @Body() dto: SendCampaignTestDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.campaigns.sendTest(id, dto);
    this.auditLog.record(user.id, 'campaign.test_sent', 'Campaign', id, { phone: dto.phone });
    return result;
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/trigger')
  async trigger(@Param('id') id: string, @Body() dto: TriggerCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.campaigns.trigger(id, dto);
    this.auditLog.record(user.id, 'campaign.triggered', 'Campaign', id, {
      triggeredCount: result.triggeredCount,
    });
    return result;
  }
}
