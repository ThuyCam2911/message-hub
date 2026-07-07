import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/current-user.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FailoverPoliciesService } from './failover-policies.service';
import { CreateFailoverPolicyDto } from './dto/create-failover-policy.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('failover-policies')
export class FailoverPoliciesController {
  constructor(
    private readonly policies: FailoverPoliciesService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  async create(@Body() dto: CreateFailoverPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.policies.create(dto);
    this.auditLog.record(user.id, 'failover_policy.created', 'FailoverPolicy', result.id, {
      name: dto.name,
      stepCount: dto.steps.length,
    });
    return result;
  }

  @Get()
  list() {
    return this.policies.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.policies.get(id);
  }
}
