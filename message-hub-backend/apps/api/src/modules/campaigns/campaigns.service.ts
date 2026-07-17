import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  Campaign,
  CampaignStatus,
  ChannelStrategy,
  Contact,
  FailoverPolicyStep,
  MessageRequest,
} from '@message-hub/domain';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { OrganizationsService } from '../organizations/organizations.service';
import { MessageRequestsService } from '../message-requests/message-requests.service';
import { ContactsService } from '../contacts/contacts.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { TriggerCampaignDto } from './dto/trigger-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SendCampaignTestDto } from './dto/send-campaign-test.dto';

export interface ListCampaignsFilter {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface CampaignMessageRequestView {
  id: string;
  status: string;
  contactId: string;
  contactName: string;
  finalChannelStrategyId?: string;
  channelName?: string;
  currentStepOrder?: number;
  createdAt: Date;
  completedAt?: Date;
  firstSentAt?: Date;
  lastUpdatedAt: Date;
  firstOpenedAt?: Date;
  firstClickedAt?: Date;
  totalClicks: number;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Contact) private readonly contacts: Repository<Contact>,
    @InjectRepository(MessageRequest) private readonly requests: Repository<MessageRequest>,
    @InjectRepository(FailoverPolicyStep) private readonly policySteps: Repository<FailoverPolicyStep>,
    @InjectRepository(ChannelStrategy) private readonly channelStrategies: Repository<ChannelStrategy>,
    private readonly orgs: OrganizationsService,
    private readonly messageRequests: MessageRequestsService,
    private readonly contactsService: ContactsService,
    private readonly adapterRegistry: ChannelAdapterRegistry,
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

  async list(filter: ListCampaignsFilter = {}) {
    const qb = this.campaigns
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: this.orgs.getDefaultOrganizationId() });
    if (filter.search) {
      qb.andWhere('(c.name ILIKE :search OR c.id::text ILIKE :search)', { search: `%${filter.search}%` });
    }
    if (filter.status) {
      qb.andWhere('c.status = :status', { status: filter.status });
    }
    if (filter.from) {
      qb.andWhere('c."createdAt" >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('c."createdAt" <= :to', { to: filter.to });
    }
    const campaigns = await qb.orderBy('c."createdAt"', 'DESC').getMany();
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

  /**
   * Per-recipient breakdown for the campaign detail view (Message + Job
   * tabs) — contact name, delivery channel, and view/click tracking are all
   * resolved server-side so the UI doesn't have to look any of it up.
   */
  async getMessageRequests(id: string): Promise<CampaignMessageRequestView[]> {
    await this.findOrThrow(id);
    const requests = await this.requests.find({ where: { campaignId: id }, order: { createdAt: 'DESC' } });
    if (requests.length === 0) return [];

    const contactIds = [...new Set(requests.map((r) => r.contactId))];
    const contacts = await this.contacts.find({ where: { id: In(contactIds) } });
    const contactNameById = new Map(contacts.map((c) => [c.id, c.displayName]));

    const rows: {
      id: string;
      channel_name: string | null;
      first_sent_at: Date | null;
      last_attempt_at: Date | null;
      first_opened_at: Date | null;
      first_clicked_at: Date | null;
      total_clicks: number;
    }[] = await this.dataSource.query(
      `
      SELECT
        mr.id,
        ch.name as channel_name,
        (SELECT MIN(ma.sent_at) FROM message_attempts ma WHERE ma.message_request_id = mr.id) as first_sent_at,
        (SELECT MAX(COALESCE(ma.status_updated_at, ma.sent_at, ma."createdAt"))
           FROM message_attempts ma WHERE ma.message_request_id = mr.id) as last_attempt_at,
        (SELECT MIN(te.occurred_at)
           FROM message_attempts ma JOIN tracking_events te ON te.message_attempt_id = ma.id
           WHERE ma.message_request_id = mr.id AND te.event_type = 'view') as first_opened_at,
        (SELECT MIN(te.occurred_at)
           FROM message_attempts ma JOIN tracking_events te ON te.message_attempt_id = ma.id
           WHERE ma.message_request_id = mr.id AND te.event_type = 'click') as first_clicked_at,
        (SELECT COUNT(*)::int
           FROM message_attempts ma JOIN tracking_events te ON te.message_attempt_id = ma.id
           WHERE ma.message_request_id = mr.id AND te.event_type = 'click') as total_clicks
      FROM message_requests mr
      LEFT JOIN channel_strategies cs ON cs.id = mr.final_channel_strategy_id
      LEFT JOIN channels ch ON ch.id = cs.channel_id
      WHERE mr.campaign_id = $1
      `,
      [id],
    );
    const enrichmentById = new Map(rows.map((r) => [r.id, r]));

    return requests.map((r) => {
      const enrichment = enrichmentById.get(r.id);
      return {
        id: r.id,
        status: r.status,
        contactId: r.contactId,
        contactName: contactNameById.get(r.contactId) ?? r.contactId,
        finalChannelStrategyId: r.finalChannelStrategyId,
        channelName: enrichment?.channel_name ?? undefined,
        currentStepOrder: r.currentStepOrder,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        firstSentAt: enrichment?.first_sent_at ?? undefined,
        // Best-effort "last activity" for the Job tab: latest attempt update,
        // falling back to completedAt/createdAt for requests with no
        // attempts yet (there is no dedicated updated_at column on
        // message_requests itself).
        lastUpdatedAt: enrichment?.last_attempt_at ?? r.completedAt ?? r.createdAt,
        firstOpenedAt: enrichment?.first_opened_at ?? undefined,
        firstClickedAt: enrichment?.first_clicked_at ?? undefined,
        totalClicks: enrichment?.total_clicks ?? 0,
      };
    });
  }

  /**
   * Adds recipient progress + open/click rate + the earliest/latest activity
   * dates (start/end) for the list & detail pages — computed from
   * message_requests/tracking_events rather than a stored field, since
   * campaigns have no explicit schedule/completion timestamp of their own.
   */
  private async withProgress(campaign: Campaign) {
    const [row] = await this.dataSource.query(
      `
      SELECT
        COUNT(DISTINCT mr.id)::int as total,
        COUNT(DISTINCT CASE WHEN mr.status = 'delivered' THEN mr.id END)::int as delivered,
        COUNT(DISTINCT CASE WHEN mr.status = 'failed' THEN mr.id END)::int as failed,
        COUNT(DISTINCT CASE WHEN mr.status IN ('in_progress', 'pending') THEN mr.id END)::int as in_progress,
        COUNT(DISTINCT CASE WHEN te.event_type = 'view' THEN mr.id END)::int as opened,
        COUNT(DISTINCT CASE WHEN te.event_type = 'click' THEN mr.id END)::int as clicked,
        MIN(mr."createdAt") as start_date,
        MAX(mr.completed_at) as end_date
      FROM message_requests mr
      LEFT JOIN message_attempts ma ON ma.message_request_id = mr.id
      LEFT JOIN tracking_events te ON te.message_attempt_id = ma.id
      WHERE mr.campaign_id = $1
      `,
      [campaign.id],
    );

    const total = row?.total ?? 0;
    const progress = {
      total,
      delivered: row?.delivered ?? 0,
      failed: row?.failed ?? 0,
      inProgress: row?.in_progress ?? 0,
      openRate: total > 0 ? (row?.opened ?? 0) / total : 0,
      clickRate: total > 0 ? (row?.clicked ?? 0) / total : 0,
    };
    return { ...campaign, progress, startDate: row?.start_date ?? null, endDate: row?.end_date ?? null };
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

  /**
   * Sends 1 message using the campaign's own template + failover policy to an
   * ad-hoc phone number, so the user can verify the config before triggering
   * the real send to all contacts. Deliberately NOT tied to campaignId — it
   * must not show up in this campaign's recipient/progress counts or in
   * Campaign Insights analytics (both scope by campaignId).
   */
  async sendTest(id: string, dto: SendCampaignTestDto) {
    const campaign = await this.findOrThrow(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể gửi test khi campaign còn ở trạng thái draft (chưa publish)');
    }

    const steps = await this.policySteps.find({ where: { failoverPolicyId: campaign.failoverPolicyId } });
    const strategyIds = [...new Set(steps.map((s) => s.channelStrategyId))];
    const strategies = strategyIds.length
      ? await this.channelStrategies.find({ where: { id: In(strategyIds) }, relations: ['channel'] })
      : [];

    // A raw phone number can only stand in for steps whose adapter identifies
    // recipients by phone (SMS/Zalo ZNS/WhatsApp) — steps needing chat_id/uid
    // (Telegram, LINE, Zalo OA) or email have no way to resolve from a phone
    // number and are left without an identifier, so the engine will correctly
    // fail/skip past them exactly like it would for a real contact missing
    // that identifier.
    const phoneChannelTypes = new Set(
      strategies
        .filter((s) => this.adapterRegistry.get(s.strategyKey).identifierKind === 'phone')
        .map((s) => s.channel!.channelType),
    );

    if (phoneChannelTypes.size === 0) {
      throw new BadRequestException(
        'Failover policy của campaign này không có bước nào nhận diện qua số điện thoại (SMS/Zalo ZNS/WhatsApp) — không thể test bằng số điện thoại.',
      );
    }

    const phoneChannelTypeList = [...phoneChannelTypes];
    const existingContact = await this.contactsService.findByIdentifierValue(phoneChannelTypeList, 'phone', dto.phone);
    const contact =
      existingContact ??
      (await this.contacts.save(
        this.contacts.create({
          organizationId: this.orgs.getDefaultOrganizationId(),
          displayName: `[Test] ${dto.phone}`,
          attributes: dto.templateVariables ?? {},
        }),
      ));

    for (const channelType of phoneChannelTypeList) {
      await this.contactsService.upsertIdentifier(contact.id, channelType, 'phone', dto.phone);
    }

    return this.messageRequests.create({
      contactId: contact.id,
      templateId: campaign.templateId,
      failoverPolicyId: campaign.failoverPolicyId,
      templateVariables: dto.templateVariables ?? {},
    });
  }

  private async findOrThrow(id: string): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }
}
