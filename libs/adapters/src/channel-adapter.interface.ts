import { ChannelType } from '@message-hub/domain';

export interface SendInput {
  /** Resolved from contact_identifiers for this strategy's identifier kind. */
  recipientIdentifier: string;
  templateBody: string | Record<string, unknown>;
  variables: Record<string, unknown>;
  /** Decrypted channel-level credentials (shared across strategies on the channel). */
  channelConfig: Record<string, unknown>;
  /** Decrypted strategy-specific config overrides. */
  strategyConfig: Record<string, unknown>;
  /** message_attempt.id — pass through as an idempotency key where the provider supports it. */
  idempotencyKey: string;
}

export interface SendResult {
  status: 'sent' | 'provider_error';
  providerMessageId?: string;
  rawResponse: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface StatusResult {
  status: 'delivered' | 'undelivered' | 'pending' | 'unknown';
  rawResponse: unknown;
}

export interface ParsedWebhookEvent {
  providerMessageId: string;
  status: 'delivered' | 'undelivered' | 'read' | 'failed';
  errorCode?: string;
  rawPayload: unknown;
}

/** Minimal JSON-schema-like shape used to render a dynamic config form in the frontend. */
export interface AdapterConfigSchema {
  type: 'object';
  properties: Record<
    string,
    { type: 'string' | 'number' | 'boolean'; title: string; description?: string; secret?: boolean }
  >;
  required?: string[];
}

/**
 * Every channel/provider integration implements this contract. The
 * FailoverEngine and API only ever depend on this interface + the registry
 * below — never on a concrete adapter class — so adding a new provider later
 * is purely additive (one class + one registration).
 */
export interface ChannelAdapter {
  /** Unique key, matches channel_strategies.strategy_key (e.g. 'zbs_uid', 'sms_http'). */
  readonly strategyKey: string;
  readonly channelType: ChannelType;
  /** Which contact_identifiers.identifier_kind this strategy needs to resolve a recipient. */
  readonly identifierKind: string;

  send(input: SendInput): Promise<SendResult>;

  /** Optional active poll fallback for providers without delivery webhooks. */
  getStatus?(providerMessageId: string, channelConfig: Record<string, unknown>): Promise<StatusResult>;

  /** channelConfig is the decrypted config of the channel the webhook route resolved to. */
  parseWebhook(
    rawPayload: unknown,
    headers: Record<string, string>,
    channelConfig: Record<string, unknown>,
  ): Promise<ParsedWebhookEvent | null>;

  /** Powers the "Test connection" button in the channel config UI. */
  validateConfig(channelConfig: Record<string, unknown>): Promise<{ valid: boolean; error?: string }>;

  getConfigSchema(): AdapterConfigSchema;

  /**
   * Optional: providers with a server-side template registry (e.g. Zalo ZNS
   * pre-approved templates) can expose it so the Templates UI lets users pick
   * a real templateId instead of typing one by hand.
   */
  listTemplates?(channelConfig: Record<string, unknown>): Promise<{ templateId: string; templateName: string; status: string }[]>;

  /**
   * Optional provider-specific webhook signature check (e.g. Meta's
   * X-Hub-Signature-256 HMAC). rawBody is the exact bytes received, required
   * because signatures are computed over the raw payload, not the
   * re-serialized JSON. Adapters without a webhook signature scheme omit
   * this — the webhook controller then treats the request as unauthenticated
   * and the caller decides whether that's acceptable (e.g. mock's is fine).
   */
  verifyWebhookSignature?(rawBody: Buffer, headers: Record<string, string>, channelConfig: Record<string, unknown>): boolean;
}
