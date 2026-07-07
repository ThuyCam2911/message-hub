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

interface ZaloOaChannelConfig {
  accessToken: string;
}

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

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as ZaloOaChannelConfig;
    if (!config.accessToken) return { valid: false, error: 'accessToken is required' };
    try {
      await axios.get('https://openapi.zalo.me/v3.0/oa/getoa', {
        headers: { access_token: config.accessToken },
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
        accessToken: { type: 'string', title: 'Zalo OA Access Token', secret: true },
      },
      required: ['accessToken'],
    };
  }
}
