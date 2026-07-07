import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Campaign, CampaignStatus, Contact, MessageRequest } from '@message-hub/domain';
import { OrganizationsService } from '../organizations/organizations.service';
import { MessageRequestsService } from '../message-requests/message-requests.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { TriggerCampaignDto } from './dto/trigger-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

export interface CampaignMessageRequestView {
  id: string;
  status: string;
  contactId: string;
  contactName: string;
  finalChannelStrategyId?: string;
  createdAt: Date;
  completedAt?: Date;
}

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

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOrThrow(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể sửa campaign khi còn ở trạng thái draft (chưa trigger send)');
    }
    const patch: Partial<Campaign> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.templateId !== undefined) patch.templateId = dto.templateId;
    if (dto.failoverPolicyId !== undefined) patch.failoverPolicyId = dto.failoverPolicyId;
    if (Object.keys(patch).length > 0) {
      // TypeORM's QueryDeepPartialEntity can't structurally match Partial<Campaign>
      // here because of the optional relation properties (template/failoverPolicy).
      await this.campaigns.update(id, patch as any);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const campaign = await this.findOrThrow(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ có thể xoá campaign khi còn ở trạng thái draft — campaign đã chạy được giữ lại để lưu lịch sử gửi tin',
      );
    }
    await this.campaigns.delete(id);
    return { deleted: true };
  }

  /** Per-recipient breakdown for the campaign detail view — contact name resolved so the UI doesn't have to look it up itself. */
  async getMessageRequests(id: string): Promise<CampaignMessageRequestView[]> {
    await this.findOrThrow(id);
    const requests = await this.requests.find({ where: { campaignId: id }, order: { createdAt: 'DESC' } });
    const contactIds = [...new Set(requests.map((r) => r.contactId))];
    const contacts = contactIds.length ? await this.contacts.find({ where: { id: In(contactIds) } }) : [];
    const contactNameById = new Map(contacts.map((c) => [c.id, c.displayName]));
    return requests.map((r) => ({
      id: r.id,
      status: r.status,
      contactId: r.contactId,
      contactName: contactNameById.get(r.contactId) ?? r.contactId,
      finalChannelStrategyId: r.finalChannelStrategyId,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
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
