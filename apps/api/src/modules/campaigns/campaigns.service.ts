import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Campaign, CampaignStatus, Contact, MessageRequest } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { MessageRequestsService } from '../message-requests/message-requests.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { TriggerCampaignDto } from './dto/trigger-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(MessageRequest) private readonly requests: Repository<MessageRequest>,
    private readonly orgs: OrganizationsService,
    private readonly messageRequests: MessageRequestsService,
  ) {}

  create(dto: CreateCampaignDto) {
    return this.campaigns.save(
      this.campaigns.create({
        organizationId: this.orgs.getDefaultOrganizationId(),
        name: dto.name,
        templateId: dto.templateId,
        failoverPolicyId: dto.failoverPolicyId,
        status: CampaignStatus.DRAFT,
      }),
    );
  }

  async list() {
    const campaigns = await this.campaigns.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId() },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(campaigns.map((c) => this.withProgress(c)));
  }

  async get(id: string) {
    const campaign = await this.findOrThrow(id);
    return this.withProgress(campaign);
  }

  private async withProgress(campaign: Campaign) {
    const requests = await this.requests.find({ where: { campaignId: campaign.id } });
    const progress = {
      total: requests.length,
      delivered: requests.filter((r) => r.status === 'delivered').length,
      failed: requests.filter((r) => r.status === 'failed').length,
      inProgress: requests.filter((r) => r.status === 'in_progress' || r.status === 'pending').length,
    };
    return { ...campaign, progress };
  }

  async trigger(id: string, dto: TriggerCampaignDto) {
    const campaign = await this.findOrThrow(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(`Campaign already ${campaign.status} — create a new campaign to send again`);
    }

    const organizationId = this.orgs.getDefaultOrganizationId();
    const contacts = dto.allContacts
      ? await this.contacts.find({ where: { organizationId } })
      : await this.contacts.find({ where: { organizationId, id: In(dto.contactIds ?? []) } });

    if (contacts.length === 0) {
      throw new BadRequestException('No contacts resolved to send to (check allContacts / contactIds)');
    }

    // Each contact's own attributes become that message's template variables —
    // this is what lets one campaign personalize {{name}}-style placeholders
    // per recipient instead of sending identical text to everyone.
    for (const contact of contacts) {
      await this.messageRequests.create(
        {
          contactId: contact.id,
          templateId: campaign.templateId,
          failoverPolicyId: campaign.failoverPolicyId,
          templateVariables: contact.attributes,
        },
        campaign.id,
      );
    }

    await this.campaigns.update(campaign.id, { status: CampaignStatus.RUNNING });
    return { campaignId: campaign.id, triggeredCount: contacts.length };
  }

  private async findOrThrow(id: string): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }
}
