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

interface WhatsAppChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  graphApiVersion?: string;
  /** WhatsApp Business Account ID — only needed for submitTemplate (message_templates lives under the WABA, not the phone number). */
  wabaId?: string;
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

  /**
   * Meta signs every webhook POST body with HMAC-SHA256 keyed by the app
   * secret, sent as `X-Hub-Signature-256: sha256=<hex>`. Must be computed
   * over the exact raw bytes received, not a re-serialized copy of the
   * parsed JSON (whitespace/key-order differences would break the digest).
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>, channelConfig: Record<string, unknown>): boolean {
    const config = channelConfig as unknown as WhatsAppChannelConfig;
    const header = headers['x-hub-signature-256'];
    if (!header || !config.appSecret) return false;

    const expected = `sha256=${createHmac('sha256', config.appSecret).update(rawBody).digest('hex')}`;
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(header);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
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

  /**
   * Meta's real "create template" API: POST /{waba-id}/message_templates.
   * Unverified against a live WABA (none exists yet, see task #39) — built
   * from Meta's public docs, so double-check the response shape once a real
   * account is available. Meta requires numbered placeholders ({{1}}, {{2}},
   * ...) inside the BODY component rather than named ones, so named
   * {{variable}} tokens are rewritten to positional ones here in the order
   * they first appear; `variables` (declared in template order) records
   * which name each position corresponds to.
   */
  async submitTemplate(
    channelConfig: Record<string, unknown>,
    template: { name: string; body: Record<string, unknown> | string; variables: string[] },
  ): Promise<{ providerTemplateId: string; status: string }> {
    const config = channelConfig as unknown as WhatsAppChannelConfig;
    if (!config.wabaId) {
      throw new Error('wabaId (WhatsApp Business Account ID) is required to submit a template to Meta');
    }
    const version = config.graphApiVersion ?? 'v20.0';
    const bodyText = typeof template.body === 'string' ? template.body : JSON.stringify(template.body);
    // Only number variables that actually occur in the body — declaring an
    // extra unused variable would otherwise consume a positional slot
    // ({{2}}) with nothing left to fill it, breaking Meta's requirement that
    // {{1}}, {{2}}, ... be sequential with no gaps.
    const usedVariables = template.variables.filter((name) => bodyText.includes(`{{${name}}}`));
    const positionalText = usedVariables.reduce(
      (text, name, i) => text.split(`{{${name}}}`).join(`{{${i + 1}}}`),
      bodyText,
    );

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${version}/${config.wabaId}/message_templates`,
        {
          name: template.name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          language: 'vi',
          category: 'UTILITY',
          components: [{ type: 'BODY', text: positionalText }],
        },
        { headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' } },
      );
      return {
        providerTemplateId: String(response.data?.id ?? ''),
        status: String(response.data?.status ?? 'pending'),
      };
    } catch (err) {
      const error = err as { response?: { data?: { error?: { message?: string } } }; message: string };
      throw new Error(error.response?.data?.error?.message ?? error.message);
    }
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        phoneNumberId: { type: 'string', title: 'Phone Number ID' },
        accessToken: { type: 'string', title: 'Access Token', secret: true },
        appSecret: { type: 'string', title: 'App Secret (for webhook signature verification)', secret: true },
        graphApiVersion: { type: 'string', title: 'Graph API Version (default v20.0)' },
        wabaId: { type: 'string', title: 'WhatsApp Business Account ID', description: 'Cần để submit template mới lên Meta duyệt.' },
      },
      required: ['phoneNumberId', 'accessToken', 'appSecret'],
    };
  }
}
