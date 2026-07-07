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

interface ZnsChannelConfig {
  accessToken: string;
}

/**
 * Sends via Zalo Notification Service (ZNS) using a phone number. ZNS is
 * transactional and requires a pre-approved template registered with Zalo —
 * unlike zbs_uid, freeform text isn't allowed. So this strategy expects
 * `templateBody` to already be the structured shape
 * `{ templateId: string, templateData: Record<string, unknown> }` (author it
 * that way in the Templates page for channelType='zbs' policies using this
 * strategy). templateData values still go through the usual {{variable}}
 * rendering before reaching here.
 */
@Injectable()
export class ZbsPhoneAdapter implements ChannelAdapter {
  readonly strategyKey = 'zbs_phone';
  readonly channelType = ChannelType.ZBS;
  readonly identifierKind = 'phone';

  private readonly baseUrl = 'https://business.openapi.zalo.me/message/template';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as ZnsChannelConfig;
    const body = input.templateBody as { templateId?: string; templateData?: Record<string, unknown> };

    if (!body.templateId) {
      return {
        status: 'provider_error',
        rawResponse: { templateBody: input.templateBody },
        errorCode: 'ZNS_MISSING_TEMPLATE_ID',
        errorMessage: 'Template body must include templateId for zbs_phone (ZNS) sends',
      };
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          phone: input.recipientIdentifier,
          template_id: body.templateId,
          template_data: body.templateData ?? {},
          tracking_id: input.idempotencyKey,
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
        providerMessageId: response.data?.data?.msg_id,
        rawResponse: response.data,
      };
    } catch (err) {
      const error = err as { response?: { data?: unknown }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: 'ZNS_HTTP_ERROR',
        errorMessage: error.message,
      };
    }
  }

  async parseWebhook(): Promise<ParsedWebhookEvent | null> {
    // ZNS delivery reports require a separate callback URL registration with
    // Zalo — wire up once a real ZNS account exists (Phase 3).
    return null;
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as ZnsChannelConfig;
    if (!config.accessToken) return { valid: false, error: 'accessToken is required' };
    return { valid: true };
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        accessToken: { type: 'string', title: 'ZNS Access Token', secret: true },
      },
      required: ['accessToken'],
    };
  }
}
