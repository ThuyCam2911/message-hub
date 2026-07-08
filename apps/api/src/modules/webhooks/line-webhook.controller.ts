import { Controller, Param, Post, Req, Res, RawBodyRequest } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import { Channel, ChannelType } from '@message-hub/domain';
import { ChannelAdapterRegistry } from '@message-hub/adapters';
import { EncryptionService } from '@message-hub/shared';
import { ContactsService } from '../contacts/contacts.service';

interface LineEvent {
  type?: string;
  message?: { type?: string; text?: string };
  source?: { userId?: string };
}

/**
 * LINE opt-in capture (line_push): same shape of problem as Telegram/Zalo —
 * an Official Account can't push to a user until they've added it as a
 * friend and messaged it. LINE has no deep-link mechanism that passes a
 * custom referral value through to the webhook, so (like Zalo) we match on
 * the *text* the user sends: ask them to send their contact id (see
 * LineAdapter.getInviteLink for the "add friend" link shown alongside it).
 */
@Controller('webhooks/line')
export class LineWebhookController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly registry: ChannelAdapterRegistry,
    private readonly encryption: EncryptionService,
    private readonly contacts: ContactsService,
  ) {}

  @Post(':channelId')
  async handleEvent(
    @Param('channelId') channelId: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    // Ack fast — LINE retries aggressively on non-200s.
    res.status(200).send({ received: true });

    const channel = await this.channels.findOne({ where: { id: channelId, channelType: ChannelType.LINE } });
    if (!channel || !req.rawBody) return;

    const config = channel.configEncrypted
      ? this.encryption.decrypt<{ channelSecret?: string }>(channel.configEncrypted)
      : {};
    const adapter = this.registry.get('line_push');
    const headers = req.headers as Record<string, string>;
    // Only enforce the signature check if a channelSecret is actually
    // configured — it's optional (see LineAdapter.getConfigSchema), same
    // as Telegram's webhookSecret, so an unconfigured secret means "accept
    // unauthenticated" rather than "always reject".
    if (config.channelSecret && !adapter.verifyWebhookSignature?.(req.rawBody, headers, config)) return;

    const events = (req.body?.events ?? []) as LineEvent[];
    for (const event of events) {
      if (event.type !== 'message' || event.message?.type !== 'text') continue;
      const userId = event.source?.userId;
      const contactId = event.message?.text?.trim();
      if (!userId || !contactId) continue;
      try {
        await this.contacts.upsertIdentifier(contactId, ChannelType.LINE, 'user_id', userId);
      } catch {
        // Text wasn't a real contact id in this org — nothing to link, ignore.
      }
    }
  }
}
