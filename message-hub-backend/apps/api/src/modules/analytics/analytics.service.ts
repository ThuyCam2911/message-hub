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

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orgs: OrganizationsService,
  ) {}

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
}
