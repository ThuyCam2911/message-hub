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
   * Optional: providers whose access tokens expire (e.g. Zalo OA) can refresh
   * them here. Called by the FailoverEngine right before send() with the
   * current decrypted channelConfig; a non-null return means "here's what
   * changed" and the caller persists it back onto the channel so the next
   * send doesn't need to refresh again. Returning null means no refresh was
   * needed (or the adapter has no refresh token configured) — the caller
   * just uses channelConfig as-is.
   */
  refreshCredentials?(channelConfig: Record<string, unknown>): Promise<Record<string, unknown> | null>;

  /**
   * Optional: providers with a server-side template registry (e.g. Zalo ZNS
   * pre-approved templates) can expose it so the Templates UI lets users pick
   * a real templateId instead of typing one by hand.
   */
  listTemplates?(channelConfig: Record<string, unknown>): Promise<{ templateId: string; templateName: string; status: string }[]>;

  /**
   * Optional: providers with a real "create template" API (e.g. WhatsApp
   * Business/Meta) can push a newly-authored template up for approval here.
   * Most channels have no such API — Zalo ZNS templates, for instance, can
   * only be submitted through the zns.zalo.me web console, so ZbsPhoneAdapter
   * intentionally does not implement this; callers must fall back to
   * `listTemplates` (sync-only) for those.
   */
  submitTemplate?(
    channelConfig: Record<string, unknown>,
    template: { name: string; body: Record<string, unknown> | string; variables: string[] },
  ): Promise<{ providerTemplateId: string; status: string }>;

  /**
   * Optional provider-specific webhook signature check (e.g. Meta's
   * X-Hub-Signature-256 HMAC). rawBody is the exact bytes received, required
   * because signatures are computed over the raw payload, not the
   * re-serialized JSON. Adapters without a webhook signature scheme omit
   * this — the webhook controller then treats the request as unauthenticated
   * and the caller decides whether that's acceptable (e.g. mock's is fine).
   */
  verifyWebhookSignature?(rawBody: Buffer, headers: Record<string, string>, channelConfig: Record<string, unknown>): boolean;

  /**
   * Optional: providers that require the recipient to opt in before you can
   * message them (Telegram bots, LINE Official Accounts) can build the
   * "add me / start chat" link a contact needs to click — `payload` is
   * opaque to the caller and round-trips back through the provider's opt-in
   * webhook so the resulting identifier can be linked to the right contact.
   * Channels without an opt-in model (SMS, email, Zalo ZNS by phone) have no
   * use for this and omit it.
   */
  getInviteLink?(channelConfig: Record<string, unknown>, payload: string): Promise<string>;
}
