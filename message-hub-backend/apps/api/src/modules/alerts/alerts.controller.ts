import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@message-hub/domain';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AlertsService } from './alerts.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list() {
    return this.alerts.list();
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string) {
    return this.alerts.acknowledge(id);
  }
}
