import { ChannelType } from '@message-hub/domain';

/**
 * Fallback per-channel confirmation-wait windows when a failover_policy_step
 * doesn't override timeoutSeconds. Starting points to refine once real
 * provider SLAs are known — see plan doc for rationale per channel.
 */
export const DEFAULT_TIMEOUT_SECONDS: Record<ChannelType, number> = {
  [ChannelType.ZBS]: 30,
  [ChannelType.SMS]: 60,
  [ChannelType.TELEGRAM]: 10,
  [ChannelType.LINE]: 15,
  [ChannelType.WHATSAPP]: 45,
  [ChannelType.EMAIL]: 120,
  [ChannelType.MOCK]: 15,
};
