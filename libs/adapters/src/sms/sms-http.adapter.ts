import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { TemplateRenderer } from '@message-hub/shared';
import { ChannelType } from '@message-hub/domain';
import {
  AdapterConfigSchema,
  ChannelAdapter,
  ParsedWebhookEvent,
  SendInput,
  SendResult,
} from '../channel-adapter.interface';
import { getByPath } from './get-by-path';

interface SmsWebhookConfig {
  messageIdPath?: string;
  statusPath?: string;
  statusMap?: Record<string, 'delivered' | 'undelivered' | 'read' | 'failed'>;
}

interface SmsChannelConfig {
  endpoint: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** JSON string, e.g. '{"apiKey":"{{apiKey}}","phone":"{{phone}}","message":"{{message}}"}' */
  bodyTemplate: string;
  successPath?: string;
  successValue?: string;
  messageIdPath?: string;
  errorMessagePath?: string;
  webhook?: SmsWebhookConfig;
  [key: string]: unknown; // extra provider-specific fields substitutable into bodyTemplate
}

/**
 * No SMS provider account exists yet (eSMS/SpeedSMS/Twilio/etc. undecided).
 * Rather than guess a specific vendor's API shape, this adapter is a generic,
 * config-driven HTTP client: the request body, success/error detection, and
 * webhook parsing are all defined declaratively in channelConfig so the real
 * provider can be plugged in later purely through the channel config UI, with
 * no code changes.
 */
@Injectable()
export class SmsHttpAdapter implements ChannelAdapter {
  readonly strategyKey = 'sms_http';
  readonly channelType = ChannelType.SMS;
  readonly identifierKind = 'phone';

  private readonly renderer = new TemplateRenderer();

  async send(input: SendInput): Promise<SendResult> {
    const config = input.channelConfig as unknown as SmsChannelConfig;
    const messageText =
      typeof input.templateBody === 'string' ? input.templateBody : JSON.stringify(input.templateBody);

    const substitutions: Record<string, unknown> = {
      ...config,
      ...input.strategyConfig,
      phone: input.recipientIdentifier,
      message: messageText,
      idempotencyKey: input.idempotencyKey,
    };
    const renderedBody = this.renderer.render(config.bodyTemplate, substitutions) as string;

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(renderedBody);
    } catch {
      parsedBody = renderedBody;
    }

    try {
      const response = await axios.request({
        url: config.endpoint,
        method: config.method ?? 'POST',
        headers: config.headers,
        data: parsedBody,
      });

      const success = config.successPath
        ? config.successValue !== undefined
          ? String(getByPath(response.data, config.successPath)) === config.successValue
          : Boolean(getByPath(response.data, config.successPath))
        : response.status >= 200 && response.status < 300;

      if (!success) {
        return {
          status: 'provider_error',
          rawResponse: response.data,
          errorCode: 'SMS_PROVIDER_REJECTED',
          errorMessage: config.errorMessagePath
            ? String(getByPath(response.data, config.errorMessagePath))
            : 'Provider indicated failure',
        };
      }

      return {
        status: 'sent',
        providerMessageId: config.messageIdPath ? String(getByPath(response.data, config.messageIdPath)) : undefined,
        rawResponse: response.data,
      };
    } catch (err) {
      const error = err as Error;
      return {
        status: 'provider_error',
        rawResponse: { message: error.message },
        errorCode: 'SMS_HTTP_ERROR',
        errorMessage: error.message,
      };
    }
  }

  async parseWebhook(
    rawPayload: unknown,
    _headers: Record<string, string>,
    channelConfig: Record<string, unknown>,
  ): Promise<ParsedWebhookEvent | null> {
    const webhookConfig = (channelConfig as unknown as SmsChannelConfig)?.webhook ?? {};
    const providerMessageId = String(getByPath(rawPayload, webhookConfig.messageIdPath ?? 'providerMessageId') ?? '');
    if (!providerMessageId) return null;

    const rawStatus = String(getByPath(rawPayload, webhookConfig.statusPath ?? 'status') ?? '');
    const status = webhookConfig.statusMap?.[rawStatus] ?? (rawStatus as ParsedWebhookEvent['status']);
    if (!['delivered', 'undelivered', 'read', 'failed'].includes(status)) return null;

    return { providerMessageId, status, rawPayload };
  }

  async validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const config = channelConfig as unknown as SmsChannelConfig;
    if (!config.endpoint || !config.bodyTemplate) {
      return { valid: false, error: 'endpoint and bodyTemplate are required' };
    }
    return { valid: true };
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        endpoint: { type: 'string', title: 'API Endpoint URL' },
        method: { type: 'string', title: 'HTTP Method (GET/POST)' },
        bodyTemplate: { type: 'string', title: 'Request body template (JSON, supports {{phone}}/{{message}})' },
        successPath: { type: 'string', title: 'Response path indicating success (dot notation)' },
        messageIdPath: { type: 'string', title: 'Response path for provider message id' },
      },
      required: ['endpoint', 'bodyTemplate'],
    };
  }
}
