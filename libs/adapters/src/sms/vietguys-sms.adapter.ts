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

interface VietguysSmsConfig {
  username: string;
  password: string;
  brandname: string;
}

/** VietGuys wants phone numbers as 84xxxxxxxxx (no '+', no leading '0'). */
function toVietguysPhone(identifier: string): string {
  const digits = identifier.replace(/[^\d]/g, '');
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return `84${digits.slice(1)}`;
  return digits;
}

/**
 * VietGuys CSKH SMS gateway (https://developers.vietguys.biz). Unlike Zalo,
 * this API authenticates per-request with a static username/password rather
 * than a short-lived OAuth token, so there's no refresh cycle here — the
 * account password just gets rotated manually if it's ever compromised.
 */
@Injectable()
export class VietguysSmsAdapter implements ChannelAdapter {
  readonly strategyKey = 'sms_vietguys';
  readonly channelType = ChannelType.SMS;
  readonly identifierKind = 'phone';

  private readonly baseUrl = 'https://cloudsms.vietguys.biz:4438/api/index.php';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as VietguysSmsConfig;
    const message = typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);
    // eslint-disable-next-line no-control-regex
    const isUnicode = /[^\x00-\x7F]/.test(message);

    const params = new URLSearchParams({
      u: config.username,
      pwd: config.password,
      from: config.brandname,
      phone: toVietguysPhone(input.recipientIdentifier),
      sms: message,
      bid: input.idempotencyKey.slice(0, 50),
      type: isUnicode ? '8' : '0',
      json: '1',
    });

    try {
      const response = await axios.post(this.baseUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data as { error?: number; msgid?: string; log?: string };
      if (data.error !== 0) {
        return {
          status: 'provider_error',
          rawResponse: data,
          errorCode: String(data.error ?? 'UNKNOWN'),
          errorMessage: data.log ?? 'VietGuys báo lỗi khi gửi SMS',
        };
      }

      return { status: 'sent', providerMessageId: data.msgid, rawResponse: data };
    } catch (err) {
      const error = err as { response?: { data?: unknown }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: 'VIETGUYS_HTTP_ERROR',
        errorMessage: error.message,
      };
    }
  }

  /** VietGuys posts delivery reports to a URL registered with their support team (no signature scheme documented). */
  async parseWebhook(rawPayload: unknown): Promise<ParsedWebhookEvent | null> {
    const payload = rawPayload as { data?: { message_id?: string; status?: string } };
    const messageId = payload?.data?.message_id;
    if (!messageId) return null;

    const statusMap: Record<string, ParsedWebhookEvent['status']> = {
      delivered: 'delivered',
      fail: 'undelivered',
    };
    const status = statusMap[payload.data?.status ?? ''];
    // 'sent' isn't a terminal status (it just confirms dispatch, which the
    // synchronous send() response already told us) — nothing to advance on.
    if (!status) return null;

    return { providerMessageId: messageId, status, rawPayload };
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as VietguysSmsConfig;
    if (!config.username || !config.password || !config.brandname) {
      return { valid: false, error: 'username, password và brandname đều bắt buộc' };
    }
    return { valid: true };
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        username: { type: 'string', title: 'Username' },
        password: {
          type: 'string',
          title: 'Password / Access Token',
          secret: true,
          description: 'Tài khoản VietGuys cấp cho API gửi SMS (endpoint cloudsms.vietguys.biz).',
        },
        brandname: { type: 'string', title: 'Brandname', description: 'Tên thương hiệu đã đăng ký với VietGuys, vd GIFTZONE' },
      },
      required: ['username', 'password', 'brandname'],
    };
  }
}
