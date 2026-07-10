import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from '@message-hub/domain';
import { EncryptionService } from '@message-hub/shared';
import { ContactsService } from '../contacts/contacts.service';

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
}

/**
 * Telegram opt-in capture: Telegram bots can't message a user until that
 * user has messaged the bot first (anti-spam), so there's no way to get a
 * chat_id for a contact ahead of time. The standard pattern is a deep link
 * `https://t.me/<bot>?start=<contactId>` (see ChannelsService.getInviteLink)
 * — when the contact clicks it and Telegram delivers the resulting
 * `/start <contactId>` message here, we read the chat_id straight off the
 * update and link it to that contact's `telegram`/`chat_id` identifier.
 *
 * One route per channel (not a single shared URL) because each Telegram
 * channel has its own bot token/webhook registration — register this exact
 * URL (`https://<host>/webhooks/telegram/<channelId>`) with `setWebhook`.
 */
@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly encryption: EncryptionService,
    private readonly contacts: ContactsService,
  ) {}

  @Post(':channelId')
  async handleUpdate(
    @Param('channelId') channelId: string,
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
  ) {
    // Always ack 200 quickly regardless of outcome — Telegram retries
    // aggressively on non-200s, and an update we can't match/verify
    // shouldn't cause a retry storm.
    const channel = await this.channels.findOne({ where: { id: channelId, channelType: ChannelType.TELEGRAM } });
    if (!channel) return { ok: true };

    const config = channel.configEncrypted
      ? this.encryption.decrypt<{ webhookSecret?: string }>(channel.configEncrypted)
      : {};
    if (config.webhookSecret && secretToken !== config.webhookSecret) {
      return { ok: true };
    }

    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    if (!chatId || !text?.startsWith('/start')) return { ok: true };

    const contactId = text.slice('/start'.length).trim();
    if (!contactId) return { ok: true };

    try {
      await this.contacts.upsertIdentifier(contactId, ChannelType.TELEGRAM, 'chat_id', String(chatId));
    } catch {
      // Payload wasn't a real contact id in this org, or some other lookup
      // failure — nothing to link, ignore rather than error back to Telegram.
    }
    return { ok: true };
  }
}
