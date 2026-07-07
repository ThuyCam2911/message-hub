import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Alert, AlertSeverity } from '@message-hub/domain';

const WINDOW = "1 hour";
const MIN_SAMPLE_SIZE = 5;
const WARNING_THRESHOLD = 0.5;
const CRITICAL_THRESHOLD = 0.8;

interface FailureRateRow {
  channel_strategy_id: string;
  organization_id: string;
  channel_name: string;
  strategy_key: string;
  total: number;
  failed: number;
}

/**
 * Every 5 minutes, checks each channel_strategy's failure rate over the last
 * hour and raises an Alert if it crosses a threshold. Requires a minimum
 * sample size so a single unlucky send doesn't trigger noise, and skips
 * strategies that already have an unacknowledged alert from within the
 * window so it doesn't spam the same problem repeatedly.
 */
@Injectable()
export class AlertsCronService {
  private readonly logger = new Logger(AlertsCronService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkFailureRates(): Promise<void> {
    const rows: FailureRateRow[] = await this.dataSource.query(`
      SELECT cs.id as channel_strategy_id, mr.organization_id, c.name as channel_name, cs.strategy_key,
        COUNT(ma.id)::int as total,
        SUM(CASE WHEN ma.status IN ('provider_error','undelivered','timed_out') THEN 1 ELSE 0 END)::int as failed
      FROM message_attempts ma
      JOIN channel_strategies cs ON cs.id = ma.channel_strategy_id
      JOIN channels c ON c.id = cs.channel_id
      JOIN message_requests mr ON mr.id = ma.message_request_id
      WHERE ma.created_at > now() - interval '${WINDOW}'
      GROUP BY cs.id, mr.organization_id, c.name, cs.strategy_key
      HAVING COUNT(ma.id) >= ${MIN_SAMPLE_SIZE}
    `);

    for (const row of rows) {
      const failureRate = row.failed / row.total;
      if (failureRate <= WARNING_THRESHOLD) continue;

      const recentUnacknowledged = await this.alerts.findOne({
        where: { channelStrategyId: row.channel_strategy_id, acknowledgedAt: IsNull() },
        order: { createdAt: 'DESC' },
      });
      if (recentUnacknowledged && Date.now() - recentUnacknowledged.createdAt.getTime() < 60 * 60 * 1000) {
        continue; // already alerted on this strategy within the last hour
      }

      const severity = failureRate >= CRITICAL_THRESHOLD ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
      await this.alerts.save(
        this.alerts.create({
          organizationId: row.organization_id,
          channelStrategyId: row.channel_strategy_id,
          severity,
          failureRate,
          sampleSize: row.total,
          message: `${row.channel_name} / ${row.strategy_key}: ${Math.round(failureRate * 100)}% failure rate over the last hour (${row.failed}/${row.total} attempts)`,
        }),
      );
      this.logger.warn(`Alert raised for ${row.channel_name}/${row.strategy_key}: ${Math.round(failureRate * 100)}% failure rate`);
    }
  }
}
