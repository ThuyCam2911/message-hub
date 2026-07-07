import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

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
}
