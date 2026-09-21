import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { shortId } from '../lib/ids.js';

/**
 * Access tokens: short-lived, stateless JWT. Carry userId + membership hint.
 * Refresh tokens: opaque, rotated on every use, stored HASHED (sha256).
 * On reuse of an already-rotated refresh token we revoke the whole family —
 * this catches stolen refresh tokens.
 */

export interface AccessPayload {
  sub: string; // userId
  iat?: number;
  exp?: number;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessPayload;
  } catch {
    throw errors.unauthorized('token_invalid', 'Access token invalid or expired');
  }
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export interface IssuedRefresh {
  token: string; // raw, given to client (never persisted plain)
  familyId: string;
  expiresAt: Date;
}

export async function issueRefreshToken(
  userId: string,
  familyId: string | null,
  meta: { userAgent?: string | undefined; ipAddress?: string | undefined },
): Promise<IssuedRefresh> {
  const raw = shortId() + shortId(); // 44 chars, url-safe
  const tokenHash = hashToken(raw);
  const family = familyId ?? shortId();
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      familyId: family,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
    },
  });

  return { token: raw, familyId: family, expiresAt };
}

/**
 * Rotate a refresh token. Returns a fresh access+refresh pair OR throws.
 * If the incoming token was already revoked, we revoke the entire family — the
 * old token has been reused, which means it was stolen and replayed.
 */
export async function rotateRefreshToken(
  raw: string,
  meta: { userAgent?: string | undefined; ipAddress?: string | undefined },
): Promise<{ access: string; refresh: IssuedRefresh; userId: string }> {
  const tokenHash = hashToken(raw);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record) throw errors.unauthorized('refresh_invalid', 'Refresh token invalid');

  const now = new Date();
  if (record.expiresAt < now) {
    throw errors.unauthorized('refresh_expired', 'Refresh token expired');
  }

  if (record.revokedAt) {
    // Reuse detected — nuke the family so any active leaked tokens die too.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw errors.unauthorized('refresh_reused', 'Refresh token reuse detected — session revoked');
  }

  // Revoke this one, issue the next.
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: now },
  });

  const refresh = await issueRefreshToken(record.userId, record.familyId, meta);
  const access = signAccessToken(record.userId);
  return { access, refresh, userId: record.userId };
}

export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
