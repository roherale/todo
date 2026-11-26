import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface SessionKey {
  key: Buffer;
  version: number;
}

/** Parses the configured key: 32 bytes, base64-encoded. */
export function parseSessionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('session encryption key must be 32 bytes, base64-encoded');
  return key;
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** 32 random bytes as base64url: the value of the web session cookie. */
export const newCookieValue = (): string => randomBytes(32).toString('base64url');

/**
 * AES-256-GCM with a random IV. The user id is bound as additional authenticated data,
 * so a ciphertext copied to another user's row fails to decrypt.
 * Layout: base64(iv[12] | ciphertext | tag[16]).
 */
export function encryptForUser(plain: string, userId: string, { key }: SessionKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64');
}

export function decryptForUser(encoded: string, userId: string, { key }: SessionKey): string {
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < 12 + 16) throw new Error('ciphertext too short');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8');
}
