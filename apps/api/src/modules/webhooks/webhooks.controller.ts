import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ChannelType } from '@message-hub/domain';
import { WebhookProcessingService } from './webhook-processing.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly processing: WebhookProcessingService) {}

  /**
   * Receives the mock adapter's simulated async delivery callbacks. Exercises
   * the same audit-log + parse + match + advance pipeline that real provider
   * webhooks use — see WebhookProcessingService.
   */
  @Post('mock')
  async handleMock(@Body() body: unknown, @Headers() headers: Record<string, string>) {
    const { matched } = await this.processing.process({
      channelType: ChannelType.MOCK,
      strategyKey: 'mock_default',
      rawPayload: body,
      headers,
      channelConfig: {},
      signatureValid: true, // mock has no signature scheme
    });
    return { received: true, matched };
  }

  /**
   * VietGuys SMS delivery reports. Configure this URL (https://<host>/webhooks/vietguys)
   * with VietGuys support once the channel is live — no signature scheme is
   * documented for this callback, so like mock it's treated as unauthenticated.
   */
  @Post('vietguys')
  async handleVietguys(@Body() body: unknown, @Headers() headers: Record<string, string>) {
    const { matched } = await this.processing.process({
      channelType: ChannelType.SMS,
      strategyKey: 'sms_vietguys',
      rawPayload: body,
      headers,
      channelConfig: {},
      signatureValid: true,
    });
    return { received: true, matched };
  }
}
