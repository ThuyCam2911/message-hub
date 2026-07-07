import axios from 'axios';

/** Refresh 5 minutes before the token's actual expiry to avoid racing a send against a just-expired token. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface ZaloOaTokenConfig {
  accessToken: string;
  refreshToken?: string;
  appId?: string;
  secretKey?: string;
  /** Unix ms timestamp — set automatically after each refresh, not something the user fills in by hand. */
  expiresAt?: number;
}

/**
 * Zalo OA access tokens expire (~25h) and must be renewed via the refresh
 * token before that — the refresh token itself rotates on every use, so the
 * new pair returned here has to be persisted back onto the channel or the
 * next refresh will fail with an already-used refresh token. Shared by both
 * zbs_uid and zbs_phone since they're both OA-issued tokens from the same
 * OAuth v4 flow.
 *
 * Returns the config fields to merge and persist when a refresh happened,
 * or null when refresh isn't configured (no refreshToken/appId/secretKey —
 * caller falls back to using accessToken as-is) or the current token still
 * has enough life left.
 */
export async function refreshZaloAccessTokenIfNeeded(
  config: ZaloOaTokenConfig,
): Promise<Partial<ZaloOaTokenConfig> | null> {
  if (!config.refreshToken || !config.appId || !config.secretKey) {
    return null;
  }
  if (config.expiresAt && config.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return null;
  }

  const response = await axios.post(
    'https://oauth.zaloapp.com/v4/oa/access_token',
    new URLSearchParams({
      refresh_token: config.refreshToken,
      app_id: config.appId,
      grant_type: 'refresh_token',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: config.secretKey,
      },
    },
  );

  const data = response.data as { access_token?: string; refresh_token?: string; expires_in?: string };
  if (!data.access_token) {
    throw new Error(`Zalo refresh token response missing access_token: ${JSON.stringify(data)}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? config.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in ?? 90000) * 1000,
  };
}
