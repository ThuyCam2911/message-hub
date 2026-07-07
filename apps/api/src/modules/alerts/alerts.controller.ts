import { Controller, Get, Param, Post } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list() {
    return this.alerts.list();
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string) {
    return this.alerts.acknowledge(id);
  }
}
