import { Injectable, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Envelope-encrypts channel/strategy credential JSON at rest using AES-256-GCM.
 * Key comes from ENCRYPTION_KEY (base64, 32 bytes) — swap for a KMS-backed
 * provider later without touching call sites.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  onModuleInit() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error('ENCRYPTION_KEY env var is required to encrypt channel credentials');
    }
    this.key = Buffer.from(raw, 'base64');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
  }

  encrypt(value: unknown): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt<T = Record<string, unknown>>(payload: string): T {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buf.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  /** For "masked preview" display in config UI — never return decrypted secrets to the client. */
  maskPreview(value: unknown): string {
    const str = JSON.stringify(value);
    return str.length <= 8 ? '****' : `${str.slice(0, 2)}****${str.slice(-4)}`;
  }

  /**
   * For populating the edit form: reveals every field so the user can see
   * what's actually saved, but replaces the last 4 characters of any field
   * named in `secretKeys` with asterisks so the full credential never
   * round-trips to the browser.
   */
  maskSecretFields(config: Record<string, unknown>, secretKeys: Set<string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (secretKeys.has(key) && typeof value === 'string') {
        result[key] = value.length <= 4 ? '*'.repeat(value.length) : `${value.slice(0, -4)}****`;
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
