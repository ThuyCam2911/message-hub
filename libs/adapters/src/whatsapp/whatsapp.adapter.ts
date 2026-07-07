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

interface WhatsAppChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  graphApiVersion?: string;
}

/**
 * WhatsApp Business Cloud API. Unlike Telegram/Line, Meta does send async
 * delivery status webhooks (sent/delivered/read/failed), so policies using
 * this strategy should use advance_on = 'either' with a real timeout
 * (default ~45s, see DEFAULT_TIMEOUT_SECONDS).
 *
 * Sends a plain text message — outside WhatsApp's 24h customer-service
 * window Meta requires a pre-approved template message instead; that's a
 * follow-up once a real WABA account exists and template needs are known.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly strategyKey = 'whatsapp_cloud';
  readonly channelType = ChannelType.WHATSAPP;
  readonly identifierKind = 'phone';

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as WhatsAppChannelConfig;
    const version = config.graphApiVersion ?? 'v20.0';
    const text = typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: input.recipientIdentifier,
          type: 'text',
          text: { body: text },
        },
        { headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' } },
      );

      const messageId = response.data?.messages?.[0]?.id;
      return { status: 'sent', providerMessageId: messageId, rawResponse: response.data };
    } catch (err) {
      const error = err as { response?: { data?: { error?: { message?: string; code?: number } } }; message: string };
      return {
        status: 'provider_error',
        rawResponse: error.response?.data ?? { message: error.message },
        errorCode: String(error.response?.data?.error?.code ?? 'WHATSAPP_HTTP_ERROR'),
        errorMessage: error.response?.data?.error?.message ?? error.message,
      };
    }
  }

  async parseWebhook(rawPayload: unknown): Promise<ParsedWebhookEvent | null> {
    // Meta batches multiple status updates per webhook call in theory; this
    // parses the first status entry found, which covers the common single-
    // message case. Batched-callback fan-out is a Phase 3+ improvement.
    const entry = (rawPayload as { entry?: unknown[] })?.entry?.[0] as
      | { changes?: { value?: { statuses?: unknown[] } }[] }
      | undefined;
    const statusEntry = entry?.changes?.[0]?.value?.statuses?.[0] as
      | { id?: string; status?: string; errors?: { code?: number; title?: string }[] }
      | undefined;
    if (!statusEntry?.id || !statusEntry.status) return null;

    // WhatsApp's own 'sent' status just confirms submission — that's already
    // reflected synchronously by our send() call, so it isn't a resolving
    // event for the failover engine.
    if (statusEntry.status === 'sent') return null;
    if (!['delivered', 'read', 'failed'].includes(statusEntry.status)) return null;

    return {
      providerMessageId: statusEntry.id,
      status: statusEntry.status as 'delivered' | 'read' | 'failed',
      errorCode: statusEntry.errors?.[0]?.code ? String(statusEntry.errors[0].code) : undefined,
      rawPayload,
    };
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as WhatsAppChannelConfig;
    if (!config.phoneNumberId || !config.accessToken) {
      return { valid: false, error: 'phoneNumberId and accessToken are required' };
    }
    const version = config.graphApiVersion ?? 'v20.0';
    try {
      await axios.get(`https://graph.facebook.com/${version}/${config.phoneNumberId}?fields=id`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
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
        phoneNumberId: { type: 'string', title: 'Phone Number ID' },
        accessToken: { type: 'string', title: 'Access Token', secret: true },
        graphApiVersion: { type: 'string', title: 'Graph API Version (default v20.0)' },
      },
      required: ['phoneNumberId', 'accessToken'],
    };
  }
}
