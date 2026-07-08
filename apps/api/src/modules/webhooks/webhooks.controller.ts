import { Body, Controller, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from '@message-hub/domain';
import { EncryptionService } from '@message-hub/shared';
import { WebhookProcessingService } from './webhook-processing.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly processing: WebhookProcessingService,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly encryption: EncryptionService,
  ) {}

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

  /**
   * Generic HTTP SMS delivery reports (sms_http — SmsHttpAdapter). Unlike the
   * other routes here, this adapter's parseWebhook is entirely config-driven
   * (messageIdPath/statusPath/statusMap from the channel's own `webhook`
   * config) and a system can have several sms_http channels with different
   * providers/configs — so the URL carries the channel id and this loads
   * that specific channel's real decrypted config instead of `{}`. Give
   * each provider its own `https://<host>/webhooks/sms/<channelId>` URL
   * (find the channelId on the Channels page).
   */
  @Post('sms/:channelId')
  async handleSms(
    @Param('channelId') channelId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    const channel = await this.channels.findOne({ where: { id: channelId, channelType: ChannelType.SMS } });
    if (!channel) throw new NotFoundException(`SMS channel ${channelId} not found`);
    const channelConfig = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    const { matched } = await this.processing.process({
      channelType: ChannelType.SMS,
      strategyKey: 'sms_http',
      channelId: channel.id,
      rawPayload: body,
      headers,
      channelConfig,
      signatureValid: true,
    });
    return { received: true, matched };
  }
}
