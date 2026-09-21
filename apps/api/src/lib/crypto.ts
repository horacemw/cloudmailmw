import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM encryption for at-rest secrets like migration source passwords.
 * Key is derived from JWT_REFRESH_SECRET (long-lived, high-entropy). Rotating
 * that secret invalidates existing ciphertexts — acceptable trade-off since
 * migration credentials are meant to be short-lived anyway.
 */
const KEY = crypto.createHash('sha256').update(env.JWT_REFRESH_SECRET).digest();

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB, tagB, encB] = payload.split('.');
  if (version !== 'v1' || !ivB || !tagB || !encB) throw new Error('bad_ciphertext');
  const iv = Buffer.from(ivB, 'base64url');
  const tag = Buffer.from(tagB, 'base64url');
  const enc = Buffer.from(encB, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
