import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import { DataSource } from 'typeorm';
import { randomUUID, createHash } from 'crypto';
import {
  ALL_ENTITIES,
  Organization,
  Channel,
  ChannelStrategy,
  ChannelType,
  Contact,
  ContactIdentifier,
  FailoverPolicy,
  FailoverPolicyStep,
  AdvanceOn,
  Template,
  TemplateApprovalStatus,
  Campaign,
  CampaignStatus,
  CampaignType,
} from '@message-hub/domain';

/**
 * One-shot demo data seeder for the campaign analytics dashboard. Does NOT
 * run through the real dispatch/BullMQ pipeline — message_requests,
 * message_attempts and tracking_events are inserted directly, since running
 * hundreds of campaigns through the actual failover engine would be slow and
 * adds nothing for a demo dataset. All demo rows are find-or-create by name
 * (prefixed "[Demo]") so re-running this script is a no-op for anything
 * already seeded — it only fills in campaigns that don't exist yet.
 *
 * Run with: npm run seed:demo -w apps/api
 */

const DEFAULT_ORG_NAME = 'GiftZone';
const CONTACT_COUNT = 20;
const DAYS_BACK = 60;

/** Deterministic PRNG (mulberry32) so re-seeding a fresh DB reproduces comparable-looking data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260710);
const randInt = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
const randFloat = (min: number, max: number): number => rand() * (max - min) + min;
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

const VOUCHER_TEMPLATES = [
  {
    name: '[Demo] Template Voucher Giảm Giá',
    body: '🎁 Chào {{name}}, GiftZone tặng bạn voucher giảm 20% cho đơn hàng tiếp theo! Nhập mã {{voucher_code}} khi thanh toán, áp dụng đến hết {{expiry_date}}.',
  },
  {
    name: '[Demo] Template Voucher Mua 1 Tặng 1',
    body: '🎉 Ưu đãi mua 1 tặng 1 dành riêng cho {{name}}! Dùng mã {{voucher_code}} tại GiftZone trước {{expiry_date}} nhé.',
  },
];
const LOYALTY_TEMPLATES = [
  {
    name: '[Demo] Template Thông Báo Tích Điểm',
    body: '⭐ Chúc mừng {{name}}, bạn vừa tích thêm {{points}} điểm thành viên GiftZone. Tổng điểm hiện tại: {{total_points}}.',
  },
  {
    name: '[Demo] Template Nhắc Đổi Điểm',
    body: '🌟 {{name}} ơi, bạn đang có {{total_points}} điểm GiftZone sắp hết hạn vào {{expiry_date}}. Đổi quà ngay kẻo lỡ!',
  },
];
const REWARD_TEMPLATES = [
  {
    name: '[Demo] Template Quà Tri Ân',
    body: '🎁 GiftZone gửi tặng {{name}} một phần quà tri ân vì đã đồng hành cùng chúng tôi. Nhận quà tại {{store_name}}.',
  },
  {
    name: '[Demo] Template Quà Sinh Nhật',
    body: '🎂 Chúc mừng sinh nhật {{name}}! GiftZone tặng bạn một phần quà đặc biệt nhân dịp này.',
  },
];

interface CampaignPlan {
  name: string;
  campaignType: CampaignType;
  templatePool: { name: string; body: string }[];
}

const CAMPAIGN_PLANS: CampaignPlan[] = [
  { name: '[Demo] Voucher Flash Sale Tết', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Voucher Giảm 20% Tháng 3', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Voucher Mua 1 Tặng 1', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Voucher Sinh Nhật GiftZone', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Voucher Khách Hàng Mới', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Voucher Cuối Tuần Vàng', campaignType: CampaignType.VOUCHER, templatePool: VOUCHER_TEMPLATES },
  { name: '[Demo] Thông Báo Tích Điểm Tháng 4', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  { name: '[Demo] Nhắc Đổi Điểm Sắp Hết Hạn', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  { name: '[Demo] Cập Nhật Hạng Thành Viên', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  { name: '[Demo] Tích Điểm Nhân Đôi Cuối Tuần', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  { name: '[Demo] Điểm Thưởng Sinh Nhật', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  { name: '[Demo] Tổng Kết Điểm Quý', campaignType: CampaignType.LOYALTY, templatePool: LOYALTY_TEMPLATES },
  {
    name: '[Demo] Quà Tri Ân Khách Hàng Thân Thiết',
    campaignType: CampaignType.REWARD,
    templatePool: REWARD_TEMPLATES,
  },
  { name: '[Demo] Quà Sinh Nhật Thành Viên', campaignType: CampaignType.REWARD, templatePool: REWARD_TEMPLATES },
  { name: '[Demo] Quà Tặng Mừng Năm Mới', campaignType: CampaignType.REWARD, templatePool: REWARD_TEMPLATES },
  { name: '[Demo] Quà Cảm Ơn Đơn Hàng Thứ 10', campaignType: CampaignType.REWARD, templatePool: REWARD_TEMPLATES },
  { name: '[Demo] Quà Giới Thiệu Bạn Bè', campaignType: CampaignType.REWARD, templatePool: REWARD_TEMPLATES },
  { name: '[Demo] Quà Tặng Cuối Năm', campaignType: CampaignType.REWARD, templatePool: REWARD_TEMPLATES },
];

/** Extracts unique {{var}} names out of a rendered-style body string. */
function extractVariables(body: string): string[] {
  const matches = body.match(/{{\s*[\w.]+\s*}}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}\s]/g, ''))));
}

/** Bulk INSERT helper — chunks rows to keep well under Postgres' parameter limit per query. */
async function bulkInsert(
  dataSource: DataSource,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valuesSql: string[] = [];
    const params: unknown[] = [];
    for (const row of batch) {
      const placeholders = row.map((_, colIdx) => `$${params.length + colIdx + 1}`);
      valuesSql.push(`(${placeholders.join(', ')})`);
      params.push(...row);
    }
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql.join(', ')}`;
    await dataSource.query(sql, params);
  }
}

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
  });
  await dataSource.initialize();

  const orgs = dataSource.getRepository(Organization);
  const channels = dataSource.getRepository(Channel);
  const strategies = dataSource.getRepository(ChannelStrategy);
  const policies = dataSource.getRepository(FailoverPolicy);
  const steps = dataSource.getRepository(FailoverPolicyStep);
  const templates = dataSource.getRepository(Template);
  const contacts = dataSource.getRepository(Contact);
  const contactIdentifiers = dataSource.getRepository(ContactIdentifier);
  const campaigns = dataSource.getRepository(Campaign);

  let org = await orgs.findOne({ where: { name: DEFAULT_ORG_NAME } });
  if (!org) {
    org = await orgs.save(orgs.create({ name: DEFAULT_ORG_NAME }));
  }
  const organizationId = org.id;

  // --- Channel + strategy + 1-step policy (mock_default, advance_on=either —
  // the only adapter where that's valid per .claude/rules/tech-defaults.md,
  // since MockAdapter has a real webhook simulation loop). ---
  let channel = await channels.findOne({ where: { name: '[Demo] Mock Channel', organizationId } });
  if (!channel) {
    channel = await channels.save(
      channels.create({
        organizationId,
        channelType: ChannelType.MOCK,
        name: '[Demo] Mock Channel',
        provider: 'mock',
        configEncrypted: null,
        isActive: true,
      }),
    );
  }
  const channelId = channel.id;

  let strategy = await strategies.findOne({ where: { channelId, strategyKey: 'mock_default' } });
  if (!strategy) {
    strategy = await strategies.save(
      strategies.create({
        channelId,
        strategyKey: 'mock_default',
        adapterName: 'mock_default',
        configEncrypted: null,
        isActive: true,
      }),
    );
  }
  const strategyId = strategy.id;

  let policy = await policies.findOne({ where: { name: '[Demo] Mock 1-step Policy', organizationId } });
  if (!policy) {
    policy = await policies.save(
      policies.create({
        organizationId,
        name: '[Demo] Mock 1-step Policy',
        description: 'Seed-only policy backing the demo campaign analytics dataset — never actually dispatched.',
        isActive: true,
      }),
    );
  }
  const policyId = policy.id;

  let step = await steps.findOne({ where: { failoverPolicyId: policyId, stepOrder: 0 } });
  if (!step) {
    step = await steps.save(
      steps.create({
        failoverPolicyId: policyId,
        stepOrder: 0,
        channelStrategyId: strategyId,
        advanceOn: AdvanceOn.EITHER,
      }),
    );
  }
  const stepId = step.id;

  // --- Templates (2 per campaign type) ---
  const templateIdByName = new Map<string, string>();
  for (const t of [...VOUCHER_TEMPLATES, ...LOYALTY_TEMPLATES, ...REWARD_TEMPLATES]) {
    let template = await templates.findOne({ where: { name: t.name, organizationId } });
    if (!template) {
      template = await templates.save(
        templates.create({
          organizationId,
          name: t.name,
          channelType: ChannelType.MOCK,
          body: t.body,
          variables: extractVariables(t.body),
          isActive: true,
          approvalStatus: TemplateApprovalStatus.NOT_REQUIRED,
        }),
      );
    }
    templateIdByName.set(t.name, template.id);
  }

  // --- Contacts (mock_id identifier so they line up with the demo channel's strategy) ---
  const contactIds: string[] = [];
  for (let i = 1; i <= CONTACT_COUNT; i++) {
    const displayName = `[Demo] Khách hàng ${String(i).padStart(2, '0')}`;
    let contact = await contacts.findOne({ where: { displayName, organizationId } });
    if (!contact) {
      contact = await contacts.save(
        contacts.create({
          organizationId,
          displayName,
          attributes: { name: displayName.replace('[Demo] ', '') },
        }),
      );
      await contactIdentifiers.save(
        contactIdentifiers.create({
          contactId: contact.id,
          channelType: ChannelType.MOCK,
          identifierKind: 'mock_id',
          value: `demo-mock-${i}`,
          isVerified: true,
        }),
      );
    }
    contactIds.push(contact.id);
  }

  // --- Campaigns + fake message_requests/attempts/tracking_events (raw inserts, no dispatch) ---
  let campaignsCreated = 0;
  let totalRequests = 0;
  let totalAttempts = 0;
  let totalTrackingEvents = 0;
  const now = Date.now();

  for (const plan of CAMPAIGN_PLANS) {
    const existing = await campaigns.findOne({ where: { name: plan.name, organizationId } });
    if (existing) {
      console.log(`Skipping "${plan.name}" — already seeded`);
      continue;
    }

    const template = pick(plan.templatePool);
    const templateId = templateIdByName.get(template.name)!;

    const campaign = await campaigns.save(
      campaigns.create({
        organizationId,
        name: plan.name,
        templateId,
        failoverPolicyId: policyId,
        status: CampaignStatus.COMPLETED,
        campaignType: plan.campaignType,
      }),
    );

    const dayOffset = randInt(0, DAYS_BACK - 1);
    const campaignCreatedAt = new Date(now - dayOffset * 24 * 3600 * 1000);
    // @CreateDateColumn always stamps "now()" on save() — override it directly
    // afterward so campaigns are spread across the last 60 days (TypeORM
    // won't let you set an auto-generated column through save()/create()).
    await dataSource.query('UPDATE campaigns SET "createdAt" = $1 WHERE id = $2', [campaignCreatedAt, campaign.id]);

    // Per-campaign funnel rates, randomized within the bands from the brief;
    // voucher/reward skew a bit higher on click-through than loyalty.
    const deliveryRate = randFloat(0.85, 0.97);
    const openRate = randFloat(0.35, 0.55);
    const clickSubRate = plan.campaignType === CampaignType.LOYALTY ? randFloat(0.15, 0.22) : randFloat(0.2, 0.3);
    const requestCount = randInt(80, 500);

    const requestRows: unknown[][] = [];
    const attemptRows: unknown[][] = [];
    const trackingRows: unknown[][] = [];

    for (let i = 0; i < requestCount; i++) {
      const requestId = randomUUID();
      const attemptId = randomUUID();
      const contactId = pick(contactIds);

      // Requests land within a few hours of the campaign's own createdAt so
      // the /analytics/campaigns/summary trend chart shows real day-to-day
      // variation instead of one giant spike on "now".
      const requestCreatedAt = new Date(campaignCreatedAt.getTime() + randInt(0, 6) * 3600 * 1000);
      const delivered = rand() < deliveryRate;
      const requestStatus = delivered ? 'delivered' : 'failed';
      const attemptStatus = delivered ? 'delivered' : rand() < 0.5 ? 'undelivered' : 'provider_error';
      const errorCode = delivered ? null : attemptStatus === 'provider_error' ? 'MOCK_PROVIDER_ERROR' : 'MOCK_UNDELIVERED';
      const sentAt = attemptStatus === 'provider_error' ? null : requestCreatedAt;
      const statusUpdatedAt = new Date(requestCreatedAt.getTime() + randInt(1, 30) * 1000);

      requestRows.push([
        requestId,
        requestCreatedAt,
        organizationId,
        campaign.id,
        contactId,
        templateId,
        policyId,
        JSON.stringify({}),
        requestStatus,
        0,
        delivered ? strategyId : null,
        statusUpdatedAt,
      ]);

      attemptRows.push([
        attemptId,
        requestCreatedAt,
        requestId,
        stepId,
        strategyId,
        1,
        attemptStatus,
        `mock_${randomUUID()}`,
        JSON.stringify({ simulate: delivered ? 'success' : 'provider_error' }),
        errorCode,
        errorCode ? 'Simulated demo failure' : null,
        sentAt,
        statusUpdatedAt,
      ]);

      if (delivered && rand() < openRate) {
        const viewOccurredAt = new Date(requestCreatedAt.getTime() + randInt(1, 48) * 3600 * 1000);
        const ipHash = createHash('sha256').update(`demo-ip-${requestId}`).digest('hex');
        trackingRows.push([
          randomUUID(),
          viewOccurredAt,
          attemptId,
          'view',
          null,
          'Mozilla/5.0 (Demo Seed Script)',
          ipHash,
          viewOccurredAt,
        ]);

        if (rand() < clickSubRate) {
          const clickOccurredAt = new Date(viewOccurredAt.getTime() + randInt(1, 6) * 3600 * 1000);
          trackingRows.push([
            randomUUID(),
            clickOccurredAt,
            attemptId,
            'click',
            'https://giftzone.vn/uu-dai',
            'Mozilla/5.0 (Demo Seed Script)',
            ipHash,
            clickOccurredAt,
          ]);
        }
      }
    }

    await bulkInsert(
      dataSource,
      'message_requests',
      [
        'id',
        '"createdAt"',
        'organization_id',
        'campaign_id',
        'contact_id',
        'template_id',
        'failover_policy_id',
        'template_variables',
        'status',
        'current_step_order',
        'final_channel_strategy_id',
        'completed_at',
      ],
      requestRows,
    );

    await bulkInsert(
      dataSource,
      'message_attempts',
      [
        'id',
        '"createdAt"',
        'message_request_id',
        'failover_policy_step_id',
        'channel_strategy_id',
        'attempt_number',
        'status',
        'provider_message_id',
        'provider_response',
        'error_code',
        'error_message',
        'sent_at',
        'status_updated_at',
      ],
      attemptRows,
    );

    if (trackingRows.length > 0) {
      await bulkInsert(
        dataSource,
        'tracking_events',
        ['id', '"createdAt"', 'message_attempt_id', 'event_type', 'url', 'user_agent', 'ip_hash', 'occurred_at'],
        trackingRows,
      );
    }

    campaignsCreated += 1;
    totalRequests += requestRows.length;
    totalAttempts += attemptRows.length;
    totalTrackingEvents += trackingRows.length;
    console.log(
      `Seeded "${plan.name}" (${plan.campaignType}): ${requestRows.length} requests, ${trackingRows.length} tracking events`,
    );
  }

  console.log('--- Seed demo campaigns done ---');
  console.log(`Campaigns created: ${campaignsCreated}`);
  console.log(`Message requests created: ${totalRequests}`);
  console.log(`Message attempts created: ${totalAttempts}`);
  console.log(`Tracking events created: ${totalTrackingEvents}`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
