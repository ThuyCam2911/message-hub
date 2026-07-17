import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrganizationsService } from '../organizations/organizations.service';

export interface ChannelStat {
  channelId: string;
  channelName: string;
  channelType: string;
  strategyKey: string;
  totalAttempts: number;
  succeeded: number;
  failed: number;
  deliveryRate: number;
}

export interface AnalyticsSummary {
  totalRequests: number;
  delivered: number;
  failed: number;
  inProgress: number;
  pending: number;
  /** Share of requests that needed at least one failover step beyond the first. */
  chainReachRate: number;
}

export interface CampaignAnalyticsFilter {
  campaignId?: string;
  campaignType?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface CampaignAnalyticsRow {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  createdAt: Date;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

export interface CampaignAnalyticsSummary {
  totals: {
    campaigns: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  };
  byType: {
    campaignType: string;
    campaigns: number;
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
    clickRate: number;
  }[];
  byStatus: {
    status: string;
    campaigns: number;
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
    clickRate: number;
  }[];
  trend: { date: string; sent: number; delivered: number; opened: number; clicked: number }[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orgs: OrganizationsService,
  ) {}

  /**
   * Builds " AND ..." conditions for the optional campaignType/status
   * filters — attributes of the campaign itself, so these narrow which
   * campaigns are in scope regardless of the time range picked.
   */
  private buildCampaignScopeSql(filter: CampaignAnalyticsFilter, params: unknown[]): string {
    const conditions: string[] = [];
    if (filter.campaignId) {
      params.push(filter.campaignId);
      conditions.push(`c.id = $${params.length}`);
    }
    if (filter.campaignType) {
      params.push(filter.campaignType);
      conditions.push(`c.campaign_type = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`c.status = $${params.length}`);
    }
    return conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Builds " AND ..." conditions bounding `mr."createdAt"` (mr = the
   * message_requests alias used in every per-campaign metric subquery) to
   * the optional from/to time range — this is what makes the dashboard's
   * time-range picker filter by *activity in that window*, not by when the
   * campaign itself was created.
   */
  private buildActivityDateSql(filter: CampaignAnalyticsFilter, params: unknown[]): string {
    const conditions: string[] = [];
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`mr."createdAt" >= $${params.length}::timestamptz`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`mr."createdAt" <= $${params.length}::timestamptz`);
    }
    return conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  }

  async getChannelStats(): Promise<ChannelStat[]> {
    const rows: {
      channel_id: string;
      channel_name: string;
      channel_type: string;
      strategy_key: string;
      total_attempts: number;
      succeeded: number;
      failed: number;
    }[] = await this.dataSource.query(
      `
      SELECT c.id as channel_id, c.name as channel_name, c.channel_type, cs.strategy_key,
        COUNT(ma.id)::int as total_attempts,
        SUM(CASE WHEN ma.status IN ('delivered','sent') THEN 1 ELSE 0 END)::int as succeeded,
        SUM(CASE WHEN ma.status IN ('provider_error','undelivered','timed_out') THEN 1 ELSE 0 END)::int as failed
      FROM message_attempts ma
      JOIN message_requests mr ON mr.id = ma.message_request_id
      JOIN channel_strategies cs ON cs.id = ma.channel_strategy_id
      JOIN channels c ON c.id = cs.channel_id
      WHERE mr.organization_id = $1
      GROUP BY c.id, c.name, c.channel_type, cs.strategy_key, cs.id
      ORDER BY total_attempts DESC
      `,
      [this.orgs.getDefaultOrganizationId()],
    );

    return rows.map((r) => ({
      channelId: r.channel_id,
      channelName: r.channel_name,
      channelType: r.channel_type,
      strategyKey: r.strategy_key,
      totalAttempts: r.total_attempts,
      succeeded: r.succeeded,
      failed: r.failed,
      deliveryRate: r.total_attempts > 0 ? r.succeeded / r.total_attempts : 0,
    }));
  }

  async getSummary(): Promise<AnalyticsSummary> {
    const [row] = await this.dataSource.query(
      `
      SELECT
        COUNT(*)::int as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END)::int as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int as failed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)::int as in_progress,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int as pending,
        SUM(CASE WHEN current_step_order > 0 THEN 1 ELSE 0 END)::int as failed_over
      FROM message_requests
      WHERE organization_id = $1
      `,
      [this.orgs.getDefaultOrganizationId()],
    );

    const total = row?.total ?? 0;
    return {
      totalRequests: total,
      delivered: row?.delivered ?? 0,
      failed: row?.failed ?? 0,
      inProgress: row?.in_progress ?? 0,
      pending: row?.pending ?? 0,
      chainReachRate: total > 0 ? (row?.failed_over ?? 0) / total : 0,
    };
  }

  /** Per-campaign delivery/open/click funnel — powers the campaign analytics table. */
  async getCampaignAnalytics(filter: CampaignAnalyticsFilter): Promise<CampaignAnalyticsRow[]> {
    const params: unknown[] = [this.orgs.getDefaultOrganizationId()];
    const scopeSql = this.buildCampaignScopeSql(filter, params);
    const activitySql = this.buildActivityDateSql(filter, params);

    const rows: {
      id: string;
      name: string;
      campaign_type: string;
      status: string;
      created_at: Date;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
    }[] = await this.dataSource.query(
      `
      SELECT
        c.id,
        c.name,
        c.campaign_type,
        c.status,
        c."createdAt" as created_at,
        (SELECT COUNT(*)::int FROM message_requests mr WHERE mr.campaign_id = c.id${activitySql}) as sent,
        (SELECT COUNT(*)::int FROM message_requests mr WHERE mr.campaign_id = c.id AND mr.status = 'delivered'${activitySql}) as delivered,
        (SELECT COUNT(DISTINCT mr.id)::int
           FROM message_requests mr
           JOIN message_attempts ma ON ma.message_request_id = mr.id
           JOIN tracking_events te ON te.message_attempt_id = ma.id AND te.event_type = 'view'
           WHERE mr.campaign_id = c.id${activitySql}) as opened,
        (SELECT COUNT(DISTINCT mr.id)::int
           FROM message_requests mr
           JOIN message_attempts ma ON ma.message_request_id = mr.id
           JOIN tracking_events te ON te.message_attempt_id = ma.id AND te.event_type = 'click'
           WHERE mr.campaign_id = c.id${activitySql}) as clicked
      FROM campaigns c
      WHERE c.organization_id = $1${scopeSql}
      ORDER BY c."createdAt" DESC
      `,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      campaignType: r.campaign_type,
      status: r.status,
      createdAt: r.created_at,
      sent: r.sent,
      delivered: r.delivered,
      opened: r.opened,
      clicked: r.clicked,
      deliveryRate: r.sent > 0 ? r.delivered / r.sent : 0,
      openRate: r.sent > 0 ? r.opened / r.sent : 0,
      clickRate: r.sent > 0 ? r.clicked / r.sent : 0,
    }));
  }

  /** Aggregate totals + per-type/per-status breakdown + a trend — powers the campaign analytics dashboard. */
  async getCampaignAnalyticsSummary(filter: CampaignAnalyticsFilter): Promise<CampaignAnalyticsSummary> {
    const totalsParams: unknown[] = [this.orgs.getDefaultOrganizationId()];
    const scopeSql = this.buildCampaignScopeSql(filter, totalsParams);
    const activitySql = this.buildActivityDateSql(filter, totalsParams);
    const perCampaignCte = `
      WITH filtered_campaigns AS (
        SELECT c.id, c.campaign_type, c.status
        FROM campaigns c
        WHERE c.organization_id = $1${scopeSql}
      ),
      per_campaign AS (
        SELECT
          f.id,
          f.campaign_type,
          f.status,
          (SELECT COUNT(*) FROM message_requests mr WHERE mr.campaign_id = f.id${activitySql}) as sent,
          (SELECT COUNT(*) FROM message_requests mr WHERE mr.campaign_id = f.id AND mr.status = 'delivered'${activitySql}) as delivered,
          (SELECT COUNT(DISTINCT mr.id)
             FROM message_requests mr
             JOIN message_attempts ma ON ma.message_request_id = mr.id
             JOIN tracking_events te ON te.message_attempt_id = ma.id AND te.event_type = 'view'
             WHERE mr.campaign_id = f.id${activitySql}) as opened,
          (SELECT COUNT(DISTINCT mr.id)
             FROM message_requests mr
             JOIN message_attempts ma ON ma.message_request_id = mr.id
             JOIN tracking_events te ON te.message_attempt_id = ma.id AND te.event_type = 'click'
             WHERE mr.campaign_id = f.id${activitySql}) as clicked
        FROM filtered_campaigns f
      )
    `;

    const [totalsRow] = await this.dataSource.query(
      `
      ${perCampaignCte}
      SELECT
        COUNT(*)::int as campaigns,
        COALESCE(SUM(sent), 0)::int as sent,
        COALESCE(SUM(delivered), 0)::int as delivered,
        COALESCE(SUM(opened), 0)::int as opened,
        COALESCE(SUM(clicked), 0)::int as clicked
      FROM per_campaign
      `,
      totalsParams,
    );

    const byTypeRows: {
      campaign_type: string;
      campaigns: number;
      sent: number;
      opened: number;
      clicked: number;
    }[] = await this.dataSource.query(
      `
      ${perCampaignCte}
      SELECT
        campaign_type,
        COUNT(*)::int as campaigns,
        COALESCE(SUM(sent), 0)::int as sent,
        COALESCE(SUM(opened), 0)::int as opened,
        COALESCE(SUM(clicked), 0)::int as clicked
      FROM per_campaign
      GROUP BY campaign_type
      ORDER BY campaign_type
      `,
      totalsParams,
    );

    const byStatusRows: {
      status: string;
      campaigns: number;
      sent: number;
      opened: number;
      clicked: number;
    }[] = await this.dataSource.query(
      `
      ${perCampaignCte}
      SELECT
        status,
        COUNT(*)::int as campaigns,
        COALESCE(SUM(sent), 0)::int as sent,
        COALESCE(SUM(opened), 0)::int as opened,
        COALESCE(SUM(clicked), 0)::int as clicked
      FROM per_campaign
      GROUP BY status
      ORDER BY status
      `,
      totalsParams,
    );

    // Trend row-level date bound: if the caller picked an explicit time
    // range (from/to), use it — so the chart's x-axis actually matches the
    // range picker instead of always showing a fixed trailing window.
    // Falls back to trailing 60 days only when no range was picked at all.
    const trendParams: unknown[] = [this.orgs.getDefaultOrganizationId()];
    const trendScopeSql = this.buildCampaignScopeSql(filter, trendParams);
    const trendActivitySql = this.buildActivityDateSql(filter, trendParams);
    const trendDateBoundSql = filter.from || filter.to ? trendActivitySql : ` AND mr."createdAt" >= now() - interval '60 days'`;
    const trendRows: { date: string; sent: number; delivered: number; opened: number; clicked: number }[] =
      await this.dataSource.query(
        `
      SELECT
        to_char(date_trunc('day', mr."createdAt"), 'YYYY-MM-DD') as date,
        COUNT(DISTINCT mr.id)::int as sent,
        COUNT(DISTINCT CASE WHEN mr.status = 'delivered' THEN mr.id END)::int as delivered,
        COUNT(DISTINCT CASE WHEN te.event_type = 'view' THEN mr.id END)::int as opened,
        COUNT(DISTINCT CASE WHEN te.event_type = 'click' THEN mr.id END)::int as clicked
      FROM message_requests mr
      JOIN campaigns c ON c.id = mr.campaign_id
      LEFT JOIN message_attempts ma ON ma.message_request_id = mr.id
      LEFT JOIN tracking_events te ON te.message_attempt_id = ma.id
      WHERE c.organization_id = $1${trendScopeSql}${trendDateBoundSql}
      GROUP BY date_trunc('day', mr."createdAt")
      ORDER BY date_trunc('day', mr."createdAt")
      `,
        trendParams,
      );

    const totalSent = totalsRow?.sent ?? 0;
    return {
      totals: {
        campaigns: totalsRow?.campaigns ?? 0,
        sent: totalSent,
        delivered: totalsRow?.delivered ?? 0,
        opened: totalsRow?.opened ?? 0,
        clicked: totalsRow?.clicked ?? 0,
        deliveryRate: totalSent > 0 ? (totalsRow?.delivered ?? 0) / totalSent : 0,
        openRate: totalSent > 0 ? (totalsRow?.opened ?? 0) / totalSent : 0,
        clickRate: totalSent > 0 ? (totalsRow?.clicked ?? 0) / totalSent : 0,
      },
      byType: byTypeRows.map((r) => ({
        campaignType: r.campaign_type,
        campaigns: r.campaigns,
        sent: r.sent,
        opened: r.opened,
        clicked: r.clicked,
        openRate: r.sent > 0 ? r.opened / r.sent : 0,
        clickRate: r.sent > 0 ? r.clicked / r.sent : 0,
      })),
      byStatus: byStatusRows.map((r) => ({
        status: r.status,
        campaigns: r.campaigns,
        sent: r.sent,
        opened: r.opened,
        clicked: r.clicked,
        openRate: r.sent > 0 ? r.opened / r.sent : 0,
        clickRate: r.sent > 0 ? r.clicked / r.sent : 0,
      })),
      trend: trendRows.map((r) => ({
        date: r.date,
        sent: r.sent,
        delivered: r.delivered,
        opened: r.opened,
        clicked: r.clicked,
      })),
    };
  }
}
