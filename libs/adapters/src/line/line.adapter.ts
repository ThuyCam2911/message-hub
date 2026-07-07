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

interface LineChannelConfig {
  channelAccessToken: string;
}

/**
 * LINE Messaging API push endpoint. Like Telegram, the push call itself is a
 * synchronous ack with no message id returned for later delivery matching, so
 * advance_on = 'provider_error' is the right default for policies using this
 * strategy.
 */
@Injectable()
export class LineAdapter implements ChannelAdapter {
  readonly strategyKey = 'line_push';
  readonly channelType = ChannelType.LINE;
  readonly identifierKind = 'user_id';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as LineChannelConfig;
    const text = typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);

    try {
      const response = await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: input.recipientIdentifier,
          messages: [{ type: 'text', text }],
        },
        {
          headers: {
            Authorization: `Bearer ${config.channelAccessToken}`,
            'Content-Type': 'application/json',
            'X-Line-Retry-Key': input.idempotencyKey,
          },
        },
      );

      return { status: 'sent', rawResponse: response.data };
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: 'LINE_HTTP_ERROR',
        errorMessage: error.response?.data?.message ?? error.message,
      };
    }
  }

  async parseWebhook(): Promise<ParsedWebhookEvent | null> {
    // LINE does deliver a webhook for inbound user events, but it requires
    // channel-secret HMAC signature verification and reports user replies /
    // read receipts rather than a simple per-message delivery status — wire
    // up once a real channel is configured (Phase 3).
    return null;
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as LineChannelConfig;
    if (!config.channelAccessToken) return { valid: false, error: 'channelAccessToken is required' };
    try {
      await axios.get('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${config.channelAccessToken}` },
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        channelAccessToken: { type: 'string', title: 'Channel Access Token', secret: true },
      },
      required: ['channelAccessToken'],
    };
  }
}
