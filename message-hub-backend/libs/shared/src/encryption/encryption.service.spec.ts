import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  function buildService(): EncryptionService {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const service = new EncryptionService();
    service.onModuleInit();
    return service;
  }

  it('round-trips an object through encrypt/decrypt', () => {
    const service = buildService();
    const original = { accessToken: 'secret-token', phoneNumberId: '12345' };
    const encrypted = service.encrypt(original);
    expect(encrypted).not.toContain('secret-token'); // not just base64 of plaintext
    expect(service.decrypt(encrypted)).toEqual(original);
  });

  it('produces a different ciphertext each time (random IV) even for the same input', () => {
    const service = buildService();
    const a = service.encrypt({ token: 'x' });
    const b = service.encrypt({ token: 'x' });
    expect(a).not.toBe(b);
  });

  it('throws when decrypting with a different key (auth tag mismatch)', () => {
    const service = buildService();
    const encrypted = service.encrypt({ token: 'x' });

    const otherService = buildService(); // generates a fresh random key
    expect(() => otherService.decrypt(encrypted)).toThrow();
  });

  it('throws at startup if ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    const service = new EncryptionService();
    expect(() => service.onModuleInit()).toThrow(/ENCRYPTION_KEY env var is required/);
  });

  it('throws at startup if ENCRYPTION_KEY does not decode to 32 bytes', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
    const service = new EncryptionService();
    expect(() => service.onModuleInit()).toThrow(/must decode to exactly 32 bytes/);
  });

  it('masks short values fully and keeps only a small preview for longer ones', () => {
    const service = buildService();
    expect(service.maskPreview({ a: 1 })).toBe('****');
    const longPreview = service.maskPreview({ accessToken: 'abcdefghijklmnopqrstuvwxyz' });
    expect(longPreview).toContain('****');
    expect(longPreview).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });
});
