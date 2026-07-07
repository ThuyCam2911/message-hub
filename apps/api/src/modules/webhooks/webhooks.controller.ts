import { Body, Controller, Headers, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelType, WebhookEvent } from '@message-hub/domain';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { FailoverEngineService } from '@message-hub/failover';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @InjectRepository(WebhookEvent) private readonly webhookEvents: Repository<WebhookEvent>,
    private readonly registry: ChannelAdapterRegistry,
    private readonly engine: FailoverEngineService,
  ) {}

  /**
   * Receives the mock adapter's simulated async delivery callbacks. Exercises
   * the same audit-log + parse + match + advance pipeline that real
   * provider webhooks (Phase 3) will use.
   */
  @Post('mock')
  async handleMock(@Body() body: unknown, @Headers() headers: Record<string, string>) {
    const adapter = this.registry.get('mock_default');
    const parsed = await adapter.parseWebhook(body, headers, {});

    const event = await this.webhookEvents.save(
      this.webhookEvents.create({
        channelType: ChannelType.MOCK,
        rawPayload: body,
        signatureValid: true, // mock has no signature scheme
      }),
    );

    if (!parsed) {
      return { received: true, matched: false };
    }

    const { matchedAttemptId } = await this.engine.handleWebhookEvent(parsed);
    if (matchedAttemptId) {
      await this.webhookEvents.update(event.id, { matchedAttemptId });
    }
    return { received: true, matched: Boolean(matchedAttemptId) };
  }
}
