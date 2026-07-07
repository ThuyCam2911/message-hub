import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

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
}
