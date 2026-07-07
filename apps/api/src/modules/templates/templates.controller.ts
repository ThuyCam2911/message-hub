import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

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
    });
    return result;
  }

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() body: { variables: Record<string, unknown> }) {
    return this.templates.preview(id, body.variables ?? {});
  }
}
