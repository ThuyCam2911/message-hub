import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { ChannelType } from '@message-hub/domain';
import {
  AdapterConfigSchema,
  ChannelAdapter,
  ParsedWebhookEvent,
  SendInput,
  SendResult,
} from '../channel-adapter.interface';

type MockSimulation = 'success' | 'provider_error' | 'async_delivered' | 'async_undelivered' | 'timeout';

interface MockStrategyConfig {
  simulate?: MockSimulation;
  delaySeconds?: number;
  errorCode?: string;
}

/**
 * Simulates a provider without any real credentials. Used to build and
 * regression-test the entire failover engine (sync errors, async
 * delivery/undelivery via a real webhook round-trip, and timeouts) before any
 * real ZBS/Telegram/Line/WhatsApp/SMS account exists.
 *
 * For async_* simulations this adapter POSTs back to this app's own
 * /webhooks/mock endpoint after `delaySeconds`, so the real webhook ingestion
 * code path (parseWebhook, matching, advancement) is exercised for real
 * instead of shortcut in-process.
 */
@Injectable()
export class MockAdapter implements ChannelAdapter {
  readonly strategyKey = 'mock_default';
  readonly channelType = ChannelType.MOCK;
  readonly identifierKind = 'mock_id';

  private get webhookBaseUrl(): string {
    return process.env.WEBHOOK_BASE_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
  }

  async send(input: SendInput): Promise<SendResult> {
    const config = (input.strategyConfig ?? {}) as MockStrategyConfig;
    const simulate = config.simulate ?? 'success';
    const providerMessageId = `mock_${randomUUID()}`;

    if (simulate === 'provider_error') {
      return {
        status: 'provider_error',
        rawResponse: { simulate },
        errorCode: config.errorCode ?? 'MOCK_PROVIDER_ERROR',
        errorMessage: 'Simulated synchronous provider error',
      };
    }

    if (simulate === 'async_delivered' || simulate === 'async_undelivered') {
      this.scheduleSelfCallback(providerMessageId, simulate, config).catch(() => {
        // best-effort in dev; a real provider's own infra guarantees delivery of the callback
      });
    }

    // 'success' and 'timeout' both accept synchronously; 'timeout' just never calls back.
    return {
      status: 'sent',
      providerMessageId,
      rawResponse: { simulate },
    };
  }

  private async scheduleSelfCallback(
    providerMessageId: string,
    simulate: 'async_delivered' | 'async_undelivered',
    config: MockStrategyConfig,
  ): Promise<void> {
    const delayMs = (config.delaySeconds ?? 5) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await axios.post(`${this.webhookBaseUrl}/webhooks/mock`, {
      providerMessageId,
      status: simulate === 'async_delivered' ? 'delivered' : 'undelivered',
      errorCode: simulate === 'async_undelivered' ? config.errorCode ?? 'MOCK_UNDELIVERED' : undefined,
    });
  }

  async parseWebhook(rawPayload: unknown): Promise<ParsedWebhookEvent | null> {
    const payload = rawPayload as {
      providerMessageId?: string;
      status?: 'delivered' | 'undelivered';
      errorCode?: string;
    };
    if (!payload?.providerMessageId || !payload.status) return null;
    return {
      providerMessageId: payload.providerMessageId,
      status: payload.status,
      errorCode: payload.errorCode,
      rawPayload,
    };
  }

  async validateConfig(): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }

  getConfigSchema(): AdapterConfigSchema {
    return {
      type: 'object',
      properties: {
        note: { type: 'string', title: 'Note', description: 'Mock channel needs no real credentials.' },
      },
    };
  }
}
