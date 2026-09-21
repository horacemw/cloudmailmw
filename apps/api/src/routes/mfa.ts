import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { errors } from '../lib/errors.js';
import { env } from '../config/env.js';
import { verifyPassword } from '../auth/password.js';
import {
  generateSecret,
  provisioningUri,
  otpauthQrPngDataUrl,
  verifyTotp,
  generateRecoveryCodes,
  consumeRecoveryCode,
  makeChallengeKey,
} from '../auth/mfa.js';
import {
  signAccessToken,
  issueRefreshToken,
  revokeAllUserSessions,
} from '../auth/tokens.js';
import { notify } from '../services/notify.js';

/**
 * TOTP 2FA API surface.
 *
 *   GET  /v1/auth/mfa                    — current MFA state for the caller
 *   POST /v1/auth/mfa/setup              — begin enrolment (returns provisioning URI + QR PNG)
 *   POST /v1/auth/mfa/verify             — confirm the first code, activate MFA, return recovery codes
 *   POST /v1/auth/mfa/disable            — { password, code } — requires password re-verify AND a current TOTP code
 *   POST /v1/auth/mfa/recovery-codes/regenerate  — { password, code }
 *
 * Also, during login: if the user has MFA enabled, /v1/auth/login returns
 *   { needsMfa: true, challenge: "…" }
 * instead of the access token, and the client posts
 *   POST /v1/auth/mfa/challenge  { challenge, code }
 * to finish the flow. Rate-limited per-IP and per-user.
 */

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const u = req.currentUser!;
      return {
        enabled: u.mfaEnabled,
        enrollmentPending: Boolean(u.mfaSecret) && !u.mfaEnabled,
        recoveryCodesRemaining: u.mfaRecoveryHashes.length,
      };
    },
  });

  fastify.post('/setup', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const u = req.currentUser!;
      if (u.mfaEnabled) throw errors.conflict('mfa_already_enabled', '2FA is already enabled');
      const { base32, ciphertext } = generateSecret();
      const uri = provisioningUri(base32, u.email);
      const qr = await otpauthQrPngDataUrl(uri);
      await prisma.user.update({
        where: { id: u.id },
        data: { mfaSecret: ciphertext, mfaEnabled: false, mfaRecoveryHashes: [] },
      });
      return { provisioningUri: uri, qrPngDataUrl: qr, base32 };
    },
  });

  fastify.post('/verify', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const body = z.object({ code: z.string().length(6) }).parse(req.body);
      const u = req.currentUser!;
      if (!u.mfaSecret) throw errors.badRequest('no_pending_setup', 'Run /setup first');
      if (u.mfaEnabled) throw errors.conflict('mfa_already_enabled', '2FA is already enabled');
      if (!verifyTotp(u.mfaSecret, body.code)) {
        throw errors.unauthorized('mfa_invalid_code', 'Code did not match');
      }
      const { plain, hashes } = await generateRecoveryCodes();
      await prisma.user.update({
        where: { id: u.id },
        data: { mfaEnabled: true, mfaRecoveryHashes: hashes },
      });
      // Revoke all other sessions to force MFA challenges going forward.
      await revokeAllUserSessions(u.id);
      await prisma.auditEvent.createMany({
        data: (await prisma.tenantMember.findMany({ where: { userId: u.id } })).map((m) => ({
          tenantId: m.tenantId,
          actorUserId: u.id,
          action: 'mfa.enabled',
          ipAddress: req.ip,
        })),
      });
      await notify({
        userId: u.id,
        kind: 'security_mfa_enabled',
        title: 'Two-factor authentication enabled',
        body: 'Your account now requires a verification code at every sign-in. Store your recovery codes in a safe place.',
      });
      return { recoveryCodes: plain, message: 'Save these codes now — they will not be shown again.' };
    },
  });

  fastify.post('/disable', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const body = z
        .object({ password: z.string().min(1), code: z.string().length(6) })
        .parse(req.body);
      const u = req.currentUser!;
      if (!u.mfaEnabled || !u.mfaSecret) throw errors.badRequest('mfa_not_enabled', 'Two-factor authentication is not enabled');
      if (!(await verifyPassword(u.passwordHash, body.password)))
        throw errors.unauthorized('bad_password', 'Password re-verification failed');
      if (!verifyTotp(u.mfaSecret, body.code))
        throw errors.unauthorized('mfa_invalid_code', 'Code did not match');
      await prisma.user.update({
        where: { id: u.id },
        data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryHashes: [] },
      });
      await prisma.auditEvent.createMany({
        data: (await prisma.tenantMember.findMany({ where: { userId: u.id } })).map((m) => ({
          tenantId: m.tenantId,
          actorUserId: u.id,
          action: 'mfa.disabled',
          ipAddress: req.ip,
        })),
      });
      await notify({
        userId: u.id,
        kind: 'security_mfa_disabled',
        title: 'Two-factor authentication disabled',
        body: 'If this was not you, change your password immediately and re-enable 2FA.',
      });
      return { ok: true };
    },
  });

  fastify.post('/recovery-codes/regenerate', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const body = z
        .object({ password: z.string().min(1), code: z.string().length(6) })
        .parse(req.body);
      const u = req.currentUser!;
      if (!u.mfaEnabled || !u.mfaSecret) throw errors.badRequest('mfa_not_enabled', 'Two-factor authentication is not enabled');
      if (!(await verifyPassword(u.passwordHash, body.password)))
        throw errors.unauthorized('bad_password');
      if (!verifyTotp(u.mfaSecret, body.code)) throw errors.unauthorized('mfa_invalid_code');
      const { plain, hashes } = await generateRecoveryCodes();
      await prisma.user.update({ where: { id: u.id }, data: { mfaRecoveryHashes: hashes } });
      return { recoveryCodes: plain };
    },
  });

  /* ─── Login challenge (called after password success) ────────── */
  fastify.post('/challenge', {
    config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
    handler: async (req, reply) => {
      const body = z
        .object({
          challenge: z.string().min(20),
          code: z.string().min(6).max(20),
        })
        .parse(req.body);
      const hash = crypto.createHash('sha256').update(body.challenge).digest('hex');
      const userId = await redis.get(makeChallengeKey(hash));
      if (!userId) throw errors.unauthorized('challenge_expired', 'Login challenge expired');
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (!u || !u.mfaEnabled || !u.mfaSecret)
        throw errors.unauthorized('mfa_not_enabled', 'MFA state changed — sign in again');

      // Accept either a TOTP code or a recovery code.
      let ok = false;
      let recoveryLeft = u.mfaRecoveryHashes;
      if (/^\d{6}$/.test(body.code)) {
        ok = verifyTotp(u.mfaSecret, body.code);
      } else {
        const remaining = await consumeRecoveryCode(body.code.toUpperCase(), u.mfaRecoveryHashes);
        if (remaining) {
          ok = true;
          recoveryLeft = remaining;
        }
      }
      if (!ok) throw errors.unauthorized('mfa_invalid_code', 'Code did not match');

      // Burn the challenge; issue real tokens now.
      await redis.del(makeChallengeKey(hash));
      if (recoveryLeft !== u.mfaRecoveryHashes) {
        await prisma.user.update({
          where: { id: u.id },
          data: { mfaRecoveryHashes: recoveryLeft },
        });
      }
      await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
      const refresh = await issueRefreshToken(u.id, null, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      const access = signAccessToken(u.id);
      reply.setCookie('cm_rt', refresh.token, {
        path: '/v1/auth',
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: refresh.expiresAt,
      });
      return { accessToken: access, expiresIn: env.JWT_ACCESS_TTL };
    },
  });
};

export default routes;
