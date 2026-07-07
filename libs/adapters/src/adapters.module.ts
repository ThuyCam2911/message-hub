import { Module } from '@nestjs/common';
import { ChannelAdapter } from './channel-adapter.interface';
import { ChannelAdapterRegistry } from './channel-adapter-registry.service';
import { CHANNEL_ADAPTERS } from './tokens';
import { MockAdapter } from './mock/mock.adapter';
import { EmailSmtpAdapter } from './email/email-smtp.adapter';
import { SmsHttpAdapter } from './sms/sms-http.adapter';
import { ZbsUidAdapter } from './zbs/zbs-uid.adapter';
import { ZbsPhoneAdapter } from './zbs/zbs-phone.adapter';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { LineAdapter } from './line/line.adapter';
import { WhatsAppAdapter } from './whatsapp/whatsapp.adapter';

const ADAPTER_PROVIDERS = [
  MockAdapter,
  EmailSmtpAdapter,
  SmsHttpAdapter,
  ZbsUidAdapter,
  ZbsPhoneAdapter,
  TelegramAdapter,
  LineAdapter,
  WhatsAppAdapter,
];

/**
 * Adding a new channel/provider: implement ChannelAdapter, add its class to
 * ADAPTER_PROVIDERS above. Nothing else in the app needs to change.
 */
@Module({
  providers: [
    ...ADAPTER_PROVIDERS,
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (...adapters: ChannelAdapter[]) => adapters,
      inject: ADAPTER_PROVIDERS,
    },
    ChannelAdapterRegistry,
  ],
  exports: [ChannelAdapterRegistry],
})
export class AdaptersModule {}
