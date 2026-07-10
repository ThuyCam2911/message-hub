import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ChannelType, UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  async create(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templates.create(dto);
    this.auditLog.record(user.id, 'template.created', 'Template', result.id, {
      name: dto.name,
      channelType: dto.channelType,
      submittedTo: dto.sourceChannelId,
    });
    return result;
  }

  @Get()
  list(@Query('channelType', new ParseEnumPipe(ChannelType, { optional: true })) channelType?: ChannelType) {
    return this.templates.list(channelType);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templates.update(id, dto);
    this.auditLog.record(user.id, 'template.updated', 'Template', id, { name: dto.name, isActive: dto.isActive });
    return result;
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templates.remove(id);
    this.auditLog.record(user.id, result.deleted ? 'template.deleted' : 'template.deactivated', 'Template', id, result);
    return result;
  }

  // Pulls the provider's already-approved templates for a channel (e.g. Zalo
  // ZNS) and upserts local Template rows — the only way to get a Zalo
  // template into this system, since submitting new ones via API isn't
  // possible (see ChannelsService.submitProviderTemplate).
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('sync/:channelId')
  async sync(@Param('channelId') channelId: string, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.templates.syncFromChannel(channelId);
    this.auditLog.record(user.id, 'template.synced', 'Channel', channelId, result);
    return result;
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() body: { variables: Record<string, unknown> }) {
    return this.templates.preview(id, body.variables ?? {});
  }
}
