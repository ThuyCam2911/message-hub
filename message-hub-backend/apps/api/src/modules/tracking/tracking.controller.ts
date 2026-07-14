import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrackingEventType } from '@message-hub/domain';
import { TrackingService } from './tracking.service';

/** 1x1 transparent GIF, decoded once at module load — served as the open-pixel response. */
const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

/**
 * Public tracking endpoints — hit directly by end-user email clients/browsers,
 * never by this app's authenticated frontend. No JwtAuthGuard on purpose (see
 * apps/api/src/modules/webhooks for the same pattern with provider webhooks).
 * Both routes are best-effort: an unknown/invalid attemptId must never surface
 * as an error response, since that would break pixel rendering or link
 * clicking for a real recipient.
 */
@Controller('t')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Get('o/:attemptId')
  async trackOpen(@Param('attemptId') attemptId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.tracking.logEvent(attemptId, TrackingEventType.VIEW, undefined, req);
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store');
    res.status(200).send(TRANSPARENT_GIF);
  }

  @Get('c/:attemptId')
  async trackClick(
    @Param('attemptId') attemptId: string,
    @Query('u') u: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Express already URL-decodes query values, so `u` here is the plain
    // target URL — no manual decodeURIComponent needed (that would
    // double-decode a URL that itself contains an encoded % sequence).
    const target = this.validateTargetUrl(u);
    if (!target) {
      res.status(400).send('Missing or invalid "u" query parameter');
      return;
    }
    await this.tracking.logEvent(attemptId, TrackingEventType.CLICK, target, req);
    res.redirect(302, target);
  }

  private validateTargetUrl(u: string | undefined): string | null {
    if (!u) return null;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return u;
    } catch {
      return null;
    }
  }
}
