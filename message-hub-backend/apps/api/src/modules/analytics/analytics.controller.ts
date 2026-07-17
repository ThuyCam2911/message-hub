import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService, CampaignAnalyticsFilter } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  getSummary() {
    return this.analytics.getSummary();
  }

  @Get('channel-stats')
  getChannelStats() {
    return this.analytics.getChannelStats();
  }

  @Get('campaigns')
  getCampaignAnalytics(
    @Query('campaignId') campaignId?: string,
    @Query('campaignType') campaignType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter: CampaignAnalyticsFilter = { campaignId, campaignType, status, from, to };
    return this.analytics.getCampaignAnalytics(filter);
  }

  @Get('campaigns/summary')
  getCampaignAnalyticsSummary(
    @Query('campaignId') campaignId?: string,
    @Query('campaignType') campaignType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filter: CampaignAnalyticsFilter = { campaignId, campaignType, status, from, to };
    return this.analytics.getCampaignAnalyticsSummary(filter);
  }
}
