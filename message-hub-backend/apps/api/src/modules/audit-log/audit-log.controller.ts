import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogService } from './audit-log.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  list() {
    return this.auditLog.list();
  }
}
