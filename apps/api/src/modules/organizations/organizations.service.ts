import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '@message-hub/domain';

const DEFAULT_ORG_NAME = 'GiftZone';

/**
 * Phase 1 runs single-org: every request is scoped to one seeded
 * organization. organization_id still lives on every table so upgrading to
 * real multi-tenant auth later (Phase 4+) is additive, not a migration.
 */
@Injectable()
export class OrganizationsService implements OnApplicationBootstrap {
  private defaultOrganizationId?: string;

  constructor(@InjectRepository(Organization) private readonly orgs: Repository<Organization>) {}

  async onApplicationBootstrap() {
    let org = await this.orgs.findOne({ where: { name: DEFAULT_ORG_NAME } });
    if (!org) {
      org = await this.orgs.save(this.orgs.create({ name: DEFAULT_ORG_NAME }));
    }
    this.defaultOrganizationId = org.id;
  }

  getDefaultOrganizationId(): string {
    if (!this.defaultOrganizationId) {
      throw new Error('OrganizationsService not yet bootstrapped');
    }
    return this.defaultOrganizationId;
  }
}
