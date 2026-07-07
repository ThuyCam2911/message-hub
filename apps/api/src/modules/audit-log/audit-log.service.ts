import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    private readonly orgs: OrganizationsService,
  ) {}

  record(actorUserId: string, action: string, entityType: string, entityId: string, diff?: unknown): void {
    // Fire-and-forget: an audit write failing should never block the actual
    // mutation it's describing.
    this.auditLogs
      .save(
        this.auditLogs.create({
          organizationId: this.orgs.getDefaultOrganizationId(),
          actorUserId,
          action,
          entityType,
          entityId,
          diff: diff as Record<string, unknown> | undefined,
        }),
      )
      .catch(() => undefined);
  }

  list() {
    return this.auditLogs.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
