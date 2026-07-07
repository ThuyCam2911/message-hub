import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ChannelType } from '@message-hub/domain';
import {
  AdapterConfigSchema,
  ChannelAdapter,
  ParsedWebhookEvent,
  SendInput,
  SendResult,
} from '../channel-adapter.interface';

interface TelegramChannelConfig {
  botToken: string;
}

/**
 * Telegram Bot API sendMessage. The API's own response is already a
 * synchronous ack (there's no separate delivery webhook for outbound bot
 * messages), so policies using this strategy should set advance_on =
 * 'provider_error': a successful call is terminal.
 */
@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly strategyKey = 'telegram_default';
  readonly channelType = ChannelType.TELEGRAM;
  readonly identifierKind = 'chat_id';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as TelegramChannelConfig;
    const text = typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);

    try {
      const response = await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        chat_id: input.recipientIdentifier,
        text,
      });

      if (!response.data?.ok) {
        return {
          status: 'provider_error',
          rawResponse: response.data,
          errorCode: String(response.data?.error_code ?? 'TELEGRAM_ERROR'),
          errorMessage: response.data?.description,
        };
      }

      // Telegram message_id is only unique within a chat, so scope it by
      // chat_id for provider-message matching (not that we expect any
      // webhook to arrive for this strategy — see parseWebhook below).
      return {
        status: 'sent',
        providerMessageId: `${input.recipientIdentifier}:${response.data.result.message_id}`,
        rawResponse: response.data,
      };
    } catch (err) {
      const error = err as { response?: { data?: unknown }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: 'TELEGRAM_HTTP_ERROR',
        errorMessage: error.message,
      };
    }
  }

  async parseWebhook(): Promise<ParsedWebhookEvent | null> {
    return null;
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as TelegramChannelConfig;
    if (!config.botToken) return { valid: false, error: 'botToken is required' };
    try {
      const response = await axios.get(`https://api.telegram.org/bot${config.botToken}/getMe`);
      return response.data?.ok ? { valid: true } : { valid: false, error: response.data?.description };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        botToken: { type: 'string', title: 'Bot Token', secret: true },
      },
      required: ['botToken'],
    };
  }
}
