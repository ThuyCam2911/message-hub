import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { Channel, ChannelType } from '@message-hub/domain';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { EncryptionService } from '@message-hub/shared';
import { WebhookProcessingService } from './webhook-processing.service';

/**
 * WhatsApp Cloud API webhook: a single URL registered with Meta receives
 * events for every phone number under the app, disambiguated by
 * `metadata.phone_number_id` inside the payload — not by a channel id in the
 * route. See WhatsAppAdapter for the signature scheme and payload shape.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly registry: ChannelAdapterRegistry,
    private readonly encryption: EncryptionService,
    private readonly processing: WebhookProcessingService,
  ) {}

  /** Meta's one-time subscription handshake when you register the webhook URL. */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && verifyToken === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Verification failed');
  }

  @Post()
  async handleEvent(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const payload = req.body as {
      entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[];
    };
    const phoneNumberId = payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    // Always ack 200 quickly — Meta retries aggressively on non-200s, and we
    // don't want a webhook we can't yet match/verify to cause a retry storm.
    res.status(200).send('EVENT_RECEIVED');

    if (!phoneNumberId || !req.rawBody) return;

    const channel = await this.findChannelByPhoneNumberId(phoneNumberId);
    if (!channel) return;

    const channelConfig = channel.configEncrypted ? this.encryption.decrypt(channel.configEncrypted) : {};
    const adapter = this.registry.get('whatsapp_cloud');
    const headers = req.headers as Record<string, string>;
    const signatureValid = adapter.verifyWebhookSignature?.(req.rawBody, headers, channelConfig) ?? false;

    await this.processing.process({
      channelType: ChannelType.WHATSAPP,
      strategyKey: 'whatsapp_cloud',
      channelId: channel.id,
      rawPayload: payload,
      headers,
      channelConfig,
      signatureValid,
    });
  }

  private async findChannelByPhoneNumberId(phoneNumberId: string): Promise<Channel | null> {
    const candidates = await this.channels.find({ where: { channelType: ChannelType.WHATSAPP, isActive: true } });
    for (const channel of candidates) {
      if (!channel.configEncrypted) continue;
      const config = this.encryption.decrypt<{ phoneNumberId?: string }>(channel.configEncrypted);
      if (config.phoneNumberId === phoneNumberId) return channel;
    }
    return null;
  }
}
