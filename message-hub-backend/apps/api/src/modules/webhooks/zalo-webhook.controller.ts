import { Controller, Param, Post, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from '@message-hub/domain';
import { ContactsService } from '../contacts/contacts.service';

interface ZaloOaEvent {
  event_name?: string;
  sender?: { id?: string };
  message?: { text?: string };
}

/**
 * Zalo OA opt-in capture (zbs_uid): like Telegram, an OA can't message a
 * user until that user has messaged the OA first. Zalo has no confirmed
 * deep-link mechanism that passes a custom referral value through to the
 * `follow`/`user_send_text` webhook event the way Telegram's `/start
 * <payload>` does, so instead of relying on that we match on the *text* the
 * user sends: ask them to send their contact id (see
 * ChannelsService.getInviteLink / ZbsUidAdapter.getInviteLink for the follow
 * link shown alongside it) and link the resulting `sender.id` here.
 *
 * No signature verification — Zalo's OA webhook signing scheme isn't
 * standardized/confirmed the way Meta's or LINE's is, so (like mock/vietguys
 * elsewhere in this codebase) this route is unauthenticated by design.
 */
@Controller('webhooks/zbs')
export class ZaloWebhookController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly contacts: ContactsService,
  ) {}

  @Post(':channelId')
  async handleEvent(@Param('channelId') channelId: string, @Body() event: ZaloOaEvent) {
    const channel = await this.channels.findOne({ where: { id: channelId, channelType: ChannelType.ZBS } });
    if (!channel) return { received: true };

    if (event.event_name !== 'user_send_text') return { received: true };
    const senderId = event.sender?.id;
    const contactId = event.message?.text?.trim();
    if (!senderId || !contactId) return { received: true };

    try {
      await this.contacts.upsertIdentifier(contactId, ChannelType.ZBS, 'uid', senderId);
    } catch {
      // Text wasn't a real contact id in this org — nothing to link, ignore.
    }
    return { received: true };
  }
}
