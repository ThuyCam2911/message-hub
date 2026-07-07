/**
 * No insecure fallback: a guessable default JWT secret would let anyone
 * forge valid tokens. Fail fast at boot instead of silently signing tokens
 * with a well-known string.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET env var is required — set it before starting the API (see .env.example)');
  }
  return secret;
}
