import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { TrackingEvent, TrackingEventType } from '@message-hub/domain';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(@InjectRepository(TrackingEvent) private readonly events: Repository<TrackingEvent>) {}

  /**
   * Best-effort by design: these two endpoints are hit directly by end-user
   * browsers/email clients (not this app's authenticated frontend), so a
   * stale/tampered/non-existent attemptId must never surface as an error —
   * it should just silently fail to log anything and let the caller still
   * return its normal pixel/redirect response.
   */
  async logEvent(
    attemptId: string,
    eventType: TrackingEventType,
    url: string | undefined,
    req: Request,
  ): Promise<void> {
    try {
      await this.events.save(
        this.events.create({
          messageAttemptId: attemptId,
          eventType,
          url,
          userAgent: req.headers['user-agent'],
          ipHash: this.hashIp(req),
        }),
      );
    } catch (err) {
      this.logger.debug(
        `Ignoring tracking event (invalid/unknown attempt ${attemptId}): ${(err as Error).message}`,
      );
    }
  }

  /** SHA-256 of the requester IP — raw IPs are never persisted (see TrackingEvent.ipHash). */
  private hashIp(req: Request): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined) ||
      req.socket?.remoteAddress ||
      undefined;
    if (!ip) return undefined;
    return createHash('sha256').update(ip).digest('hex');
  }
}
