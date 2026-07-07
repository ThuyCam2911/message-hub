import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    private readonly orgs: OrganizationsService,
  ) {}

  list() {
    return this.alerts.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async acknowledge(id: string) {
    const alert = await this.alerts.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    await this.alerts.update(id, { acknowledgedAt: new Date() });
    return this.alerts.findOneByOrFail({ id });
  }
}
