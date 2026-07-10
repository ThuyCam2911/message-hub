import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
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
  /** Used to verify X-Line-Signature on inbound webhooks (LineWebhookController) — optional so existing send-only setups aren't forced to add it. */
  channelSecret?: string;
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
    // LINE's inbound webhook (now wired up — see LineWebhookController)
    // reports user messages/follow events, not a per-push delivery status,
    // so there's still nothing here for the failover engine to resolve a
    // 'sent' attempt against.
    return null;
  }

  /**
   * LINE signs every webhook POST body with HMAC-SHA256 keyed by the
   * channel secret, base64-encoded in the `X-Line-Signature` header —
   * mirrors WhatsAppAdapter.verifyWebhookSignature's HMAC pattern.
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>, channelConfig: Record<string, unknown>): boolean {
    const config = channelConfig as unknown as LineChannelConfig;
    const header = headers['x-line-signature'];
    if (!header || !config.channelSecret) return false;

    const expected = createHmac('sha256', config.channelSecret).update(rawBody).digest('base64');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(header);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  /**
   * LINE has no deep-link mechanism that passes custom referral data through
   * to the "Add friend" webhook event, so `payload` is unused — the link
   * just opens a chat with the OA. LineWebhookController links a contact by
   * matching the *text* of their first message instead (ask them to send
   * their contact id, shown alongside this link in the UI).
   */
  async getInviteLink(channelConfig: Record<string, unknown>): Promise<string> {
    const config = channelConfig as unknown as LineChannelConfig;
    let response;
    try {
      response = await axios.get('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${config.channelAccessToken}` },
      });
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message: string };
      throw new Error(error.response?.data?.message ?? error.message);
    }
    const basicId = response.data?.basicId;
    if (!basicId) throw new Error('Không lấy được basicId từ LINE — kiểm tra lại Channel Access Token');
    return `https://line.me/R/ti/p/${basicId}`;
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
        channelSecret: {
          type: 'string',
          title: 'Channel Secret (không bắt buộc)',
          secret: true,
          description: 'Dùng để xác thực chữ ký webhook đến (X-Line-Signature) — không đặt thì webhook nhận không cần xác thực.',
        },
      },
      required: ['channelAccessToken'],
    };
  }
}
