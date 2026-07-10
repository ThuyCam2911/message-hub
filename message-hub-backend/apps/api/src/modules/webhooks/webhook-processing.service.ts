import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelType, WebhookEvent } from '@message-hub/domain';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { FailoverEngineService } from '@message-hub/failover';

export interface ProcessWebhookInput {
  channelType: ChannelType;
  strategyKey: string;
  channelId?: string;
  rawPayload: unknown;
  headers: Record<string, string>;
  channelConfig: Record<string, unknown>;
  /** Caller has already checked the provider's signature scheme (or there isn't one, e.g. mock). */
  signatureValid: boolean;
}

/**
 * Shared persist -> parse -> match -> advance pipeline used by every
 * per-channel webhook controller (mock, whatsapp, and future ones). Signature
 * verification itself is provider-specific and stays in the controller —
 * this service only records the outcome and, if valid, feeds the parsed
 * event into the failover engine.
 */
@Injectable()
export class WebhookProcessingService {
  constructor(
    @InjectRepository(WebhookEvent) private readonly webhookEvents: Repository<WebhookEvent>,
    private readonly registry: ChannelAdapterRegistry,
    private readonly engine: FailoverEngineService,
  ) {}

  async process(input: ProcessWebhookInput): Promise<{ matched: boolean }> {
    const event = await this.webhookEvents.save(
      this.webhookEvents.create({
        channelType: input.channelType,
        channelId: input.channelId,
        rawPayload: input.rawPayload,
        signatureValid: input.signatureValid,
      }),
    );

    if (!input.signatureValid) {
      return { matched: false };
    }

    const adapter = this.registry.get(input.strategyKey);
    const parsed = await adapter.parseWebhook(input.rawPayload, input.headers, input.channelConfig);
    if (!parsed) {
      return { matched: false };
    }

    const { matchedAttemptId } = await this.engine.handleWebhookEvent(parsed);
    if (matchedAttemptId) {
      await this.webhookEvents.update(event.id, { matchedAttemptId });
    }
    return { matched: Boolean(matchedAttemptId) };
  }
}
