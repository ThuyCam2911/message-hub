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
import { refreshZaloAccessTokenIfNeeded, ZaloOaTokenConfig } from './zalo-token-refresh';

type ZaloOaChannelConfig = ZaloOaTokenConfig;

/**
 * Sends via Zalo Official Account conversational messaging (v3.0 OA message
 * API) to a user identified by their Zalo UID. Only works if the user has
 * interacted with the OA within Zalo's engagement window — Zalo returns a
 * synchronous error otherwise (e.g. user hasn't followed/messaged the OA
 * recently), which is exactly the "provider_error" signal the failover chain
 * needs to fall through to zbs_phone.
 */
@Injectable()
export class ZbsUidAdapter implements ChannelAdapter {
  readonly strategyKey = 'zbs_uid';
  readonly channelType = ChannelType.ZBS;
  readonly identifierKind = 'uid';

  private readonly baseUrl = 'https://openapi.zalo.me/v3.0/oa/message';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as ZaloOaChannelConfig;
    const text = typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          recipient: { user_id: input.recipientIdentifier },
          message: { text },
        },
        { headers: { access_token: config.accessToken, 'Content-Type': 'application/json' } },
      );

      if (response.data?.error && response.data.error !== 0) {
        return {
          status: 'provider_error',
          rawResponse: response.data,
          errorCode: String(response.data.error),
          errorMessage: response.data.message,
        };
      }

      return {
        status: 'sent',
        providerMessageId: response.data?.data?.message_id,
        rawResponse: response.data,
      };
    } catch (err) {
      const error = err as { response?: { data?: unknown }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: 'ZBS_UID_HTTP_ERROR',
        errorMessage: error.message,
      };
    }
  }

  async parseWebhook(): Promise<ParsedWebhookEvent | null> {
    // Zalo OA delivery/read events arrive on a separate OA webhook
    // subscription with its own signature scheme — wire up once a real OA is
    // configured (Phase 3). Synchronous errors above already cover the
    // primary failover trigger for this strategy.
    return null;
  }

  /**
   * Unlike Telegram's `/start <payload>` deep link, Zalo has no confirmed
   * mechanism to pass a custom referral value through a "Follow OA" link
   * that gets echoed back on the OA's webhook — so `payload` is unused here
   * and the returned link is just the OA's follow page. ZbsWebhookController
   * links a contact by matching the *text* of their first message to the
   * OA instead (ask them to send their contact id, shown alongside this
   * link in the UI) rather than relying on an unverified follow-payload
   * passthrough.
   */
  async getInviteLink(channelConfig: Record<string, unknown>): Promise<string> {
    const config = channelConfig as unknown as ZaloOaChannelConfig;
    let response;
    try {
      response = await axios.get('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: { access_token: config.accessToken },
      });
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message: string };
      throw new Error(error.response?.data?.message ?? error.message);
    }
    if (response.data?.error && response.data.error !== 0) {
      throw new Error(response.data.message || `Zalo API trả về lỗi ${response.data.error} khi lấy thông tin OA`);
    }
    const oaId = response.data?.data?.oa_id;
    if (!oaId) throw new Error('Không lấy được oa_id từ Zalo — kiểm tra lại Access Token');
    return `https://zalo.me/${oaId}`;
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as ZaloOaChannelConfig;
    if (!config.accessToken) return { valid: false, error: 'accessToken is required' };
    try {
      await axios.get('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: { access_token: config.accessToken },
      });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }

  /** Refreshes the OA access token via Zalo's OAuth v4 flow — called by the FailoverEngine right before send(). */
  async refreshCredentials(channelConfig: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    return refreshZaloAccessTokenIfNeeded(channelConfig as unknown as ZaloOaChannelConfig);
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        accessToken: { type: 'string', title: 'Zalo OA Access Token', secret: true },
        refreshToken: {
          type: 'string',
          title: 'Refresh Token',
          secret: true,
          description: 'Điền cùng App ID + Secret Key để hệ thống tự động làm mới Access Token khi hết hạn (~25h).',
        },
        appId: { type: 'string', title: 'App ID' },
        secretKey: { type: 'string', title: 'Secret Key', secret: true },
      },
      required: ['accessToken'],
    };
  }
}
