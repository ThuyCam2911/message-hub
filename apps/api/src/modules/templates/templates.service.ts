import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChannelType, Template, TemplateApprovalStatus } from '@message-hub/domain';
import { TemplateRenderer } from '@message-hub/shared';
import { OrganizationsService } from '../organizations/organizations.service';
import { ChannelsService } from '../channels/channels.service';
import { isForeignKeyViolation } from '../../common/db-errors';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

export interface MutationOutcome {
  deleted: boolean;
  deactivated: boolean;
}

export interface SyncResult {
  created: number;
  updated: number;
}

/** Extracts `{{variable}}` tokens from a template body (string or nested object) so authors don't have to list ones already used in the text. */
function extractVariablesFromBody(body: string | Record<string, unknown>): string[] {
  const found = new Set<string>();
  const scan = (value: unknown) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/{{\s*([\w.]+)\s*}}/g)) found.add(match[1]);
    } else if (value && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) scan(v);
    }
  };
  scan(body);
  return [...found];
}

// Exact-match lookup per provider's documented status vocabulary — substring
// matching (e.g. `.includes('approve')`) previously misclassified real
// values in both directions: Zalo's "ENABLE" (approved/active) doesn't
// contain "approve" so it fell through to PENDING, while a status like
// Meta's "DISAPPROVED" contains "approve" and would have been marked
// APPROVED.
const PROVIDER_STATUS_MAP: Record<string, TemplateApprovalStatus> = {
  // Zalo ZNS (https://zns.zalo.me template statuses)
  enable: TemplateApprovalStatus.APPROVED,
  disable: TemplateApprovalStatus.REJECTED,
  pending_review: TemplateApprovalStatus.PENDING,
  reject: TemplateApprovalStatus.REJECTED,
  // Meta WhatsApp Business message_templates statuses
  approved: TemplateApprovalStatus.APPROVED,
  pending: TemplateApprovalStatus.PENDING,
  rejected: TemplateApprovalStatus.REJECTED,
  in_appeal: TemplateApprovalStatus.PENDING,
  pending_deletion: TemplateApprovalStatus.PENDING,
  deleted: TemplateApprovalStatus.REJECTED,
  disabled: TemplateApprovalStatus.REJECTED,
  paused: TemplateApprovalStatus.APPROVED,
};

/** Best-effort normalization of whatever free-text status a provider reports (Zalo/Meta each use their own vocabulary) — unknown values default to PENDING so an operator notices and checks the provider directly rather than assuming success. */
function mapProviderStatus(raw: string): { status: TemplateApprovalStatus; detail: string } {
  const normalized = raw.toLowerCase().trim();
  return { status: PROVIDER_STATUS_MAP[normalized] ?? TemplateApprovalStatus.PENDING, detail: raw };
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    private readonly orgs: OrganizationsService,
    private readonly renderer: TemplateRenderer,
    private readonly channels: ChannelsService,
  ) {}

  async create(dto: CreateTemplateDto) {
    const variables = [...new Set([...(dto.variables ?? []), ...extractVariablesFromBody(dto.body)])];

    let providerTemplateId: string | undefined;
    let approvalStatus = TemplateApprovalStatus.NOT_REQUIRED;
    let approvalDetail: string | undefined;

    if (dto.sourceChannelId) {
      const result = await this.channels.submitProviderTemplate(dto.sourceChannelId, {
        name: dto.name,
        body: dto.body,
        variables,
      });
      providerTemplateId = result.providerTemplateId;
      const mapped = mapProviderStatus(result.status);
      approvalStatus = mapped.status;
      approvalDetail = mapped.detail;
    }

    try {
      return await this.templates.save(
        this.templates.create({
          organizationId: this.orgs.getDefaultOrganizationId(),
          name: dto.name,
          description: dto.description,
          channelType: dto.channelType,
          body: dto.body,
          variables,
          isActive: true,
          version: 1,
          sourceChannelId: dto.sourceChannelId,
          providerTemplateId,
          approvalStatus,
          approvalDetail,
        }),
      );
    } catch (err) {
      // If the provider submission above already succeeded, that remote
      // template now exists with no local record — surface its id so an
      // admin can find/reconcile it manually instead of losing it silently.
      const orphanNote = providerTemplateId
        ? ` (đã submit lên provider với id ${providerTemplateId} — template này tồn tại phía provider nhưng chưa lưu được ở local, cần kiểm tra thủ công)`
        : '';
      throw new Error(`Không lưu được template: ${(err as Error).message}${orphanNote}`);
    }
  }

  list(channelType?: ChannelType) {
    return this.templates.find({
      where: { organizationId: this.orgs.getDefaultOrganizationId(), ...(channelType ? { channelType } : {}) },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const template = await this.templates.findOne({
      where: { id, organizationId: this.orgs.getDefaultOrganizationId() },
    });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const template = await this.get(id);
    const patch: Partial<Template> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.body !== undefined) {
      patch.body = dto.body;
      patch.variables = [...new Set([...(dto.variables ?? template.variables), ...extractVariablesFromBody(dto.body)])];
    } else if (dto.variables !== undefined) {
      patch.variables = dto.variables;
    }
    if (Object.keys(patch).length > 0) {
      // TypeORM's QueryDeepPartialEntity recurses into jsonb object types in
      // a way plain object literals can't structurally satisfy — cast is
      // safe, body is stored as opaque JSON either way.
      await this.templates.update(id, patch as any);
    }
    return this.get(id);
  }

  /** Falls back to deactivating when the template is already referenced by a message_request (onDelete: RESTRICT). */
  async remove(id: string): Promise<MutationOutcome> {
    await this.get(id);
    try {
      await this.templates.delete(id);
      return { deleted: true, deactivated: false };
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      await this.templates.update(id, { isActive: false });
      return { deleted: false, deactivated: true };
    }
  }

  /**
   * Pulls the provider's already-approved templates for a channel and
   * upserts local Template rows (matched by providerTemplateId) — creates a
   * stub row for new ones (body/variables left for you to fill in, since the
   * provider only reports the templateId + approval status, not the field
   * mapping you want) and refreshes approvalStatus on ones already tracked.
   */
  async syncFromChannel(channelId: string): Promise<SyncResult> {
    const channel = await this.channels.get(channelId);
    const providerTemplates = await this.channels.listProviderTemplates(channelId);
    const organizationId = this.orgs.getDefaultOrganizationId();
    if (providerTemplates.length === 0) return { created: 0, updated: 0 };

    // One SELECT for everything already tracked (Zalo alone can return up to
    // 100 templates per sync), instead of a findOne+save per template.
    const existingRows = await this.templates.find({
      where: {
        organizationId,
        sourceChannelId: channelId,
        providerTemplateId: In(providerTemplates.map((pt) => pt.templateId)),
      },
    });
    const existingByProviderId = new Map(existingRows.map((row) => [row.providerTemplateId, row]));
    const channelType = channel.channelType as ChannelType;

    const updates: Promise<unknown>[] = [];
    const newRows: Template[] = [];
    for (const pt of providerTemplates) {
      const mapped = mapProviderStatus(pt.status);
      const existing = existingByProviderId.get(pt.templateId);
      if (existing) {
        updates.push(this.templates.update(existing.id, { approvalStatus: mapped.status, approvalDetail: mapped.detail }));
        continue;
      }
      const body: Record<string, unknown> | string =
        channelType === ChannelType.ZBS ? { templateId: pt.templateId, templateData: {} } : pt.templateName;
      newRows.push(
        this.templates.create({
          organizationId,
          name: pt.templateName || pt.templateId,
          channelType,
          body,
          variables: [],
          isActive: true,
          version: 1,
          sourceChannelId: channelId,
          providerTemplateId: pt.templateId,
          approvalStatus: mapped.status,
          approvalDetail: mapped.detail,
        }),
      );
    }

    await Promise.all(updates);
    if (newRows.length > 0) await this.templates.save(newRows);

    return { created: newRows.length, updated: updates.length };
  }

  async preview(id: string, variables: Record<string, unknown>) {
    const template = await this.get(id);
    return { rendered: this.renderer.render(template.body, variables) };
  }
}
