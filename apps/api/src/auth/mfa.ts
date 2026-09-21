import crypto from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import argon2 from 'argon2';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';

/**
 * RFC 6238 TOTP built on `otpauth`. Wire compatible with Google
 * Authenticator, 1Password, Authy, Yubico Auth, Bitwarden, etc.
 *
 * Design decisions:
 *  - Secret stored ENCRYPTED at rest (AES-256-GCM via encryptSecret). If the
 *    JWT_REFRESH_SECRET is rotated all secrets become unreadable — that's the
 *    right escape hatch for a full-fleet 2FA reset.
 *  - Recovery codes are hashed with argon2id. Only 8 issued, single-use each.
 *  - `verify(...)` accepts a ±1 window (30-second period) to survive clock drift.
 */

const ISSUER = 'Cloud Mail';
const DIGITS = 6;
const PERIOD = 30;

export function generateSecret(): { base32: string; ciphertext: string } {
  const s = new Secret({ size: 20 }); // 160 bits
  const base32 = s.base32;
  return { base32, ciphertext: encryptSecret(base32) };
}

export function provisioningUri(base32: string, accountLabel: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(base32),
  });
  return totp.toString();
}

export async function otpauthQrPngDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}

export function verifyTotp(ciphertext: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let base32: string;
  try {
    base32 = decryptSecret(ciphertext);
  } catch {
    return false;
  }
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(base32),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate a small batch of one-time recovery codes. They're shown to the
 * user ONCE during setup; we only store the argon2 hashes. Format is
 * word-word-word-num, easy to write down.
 */
export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < 10; i++) {
    plain.push(makeCode());
  }
  const hashes = await Promise.all(plain.map((c) => argon2.hash(c)));
  return { plain, hashes };
}

/**
 * Try to consume a recovery code. Returns the NEW hash list (with the used
 * one removed) or null on no match. Constant-time-ish: we always iterate the
 * full list even after a match.
 */
export async function consumeRecoveryCode(
  code: string,
  hashes: string[],
): Promise<string[] | null> {
  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    try {
      const ok = await argon2.verify(hashes[i]!, code);
      if (ok && matchedIndex === -1) matchedIndex = i;
    } catch {
      /* ignore */
    }
  }
  if (matchedIndex === -1) return null;
  return hashes.filter((_, i) => i !== matchedIndex);
}

/**
 * MFA challenge token — a short-lived opaque token issued after a successful
 * password check. The user then submits { challenge, code } to /v1/auth/mfa/verify
 * to complete login. Server-side we store a hash of the challenge in Redis
 * keyed on `mfa:chal:<hash>` -> userId, with 5-minute TTL.
 */
export interface ChallengeIssue {
  challenge: string;
  hash: string;
  expiresAt: Date;
}
export function issueMfaChallenge(): ChallengeIssue {
  const challenge = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(challenge).digest('hex');
  return { challenge, hash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) };
}
export function makeChallengeKey(hash: string): string {
  return `mfa:chal:${hash}`;
}

// Force env module to load once at import time (env.ts validates on startup).
void env;

/* ─── helpers ──────────────────────────────────────────────────── */

function makeCode(): string {
  // 4 groups of 4 upper-case alphanumeric letters — 16 chars, ~64 bits of entropy.
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I/L
  const buf = crypto.randomBytes(16);
  const chars = Array.from(buf).map((b) => alpha[b % alpha.length]!);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}`;
}
