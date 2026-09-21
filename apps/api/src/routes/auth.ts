import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, TIMING_SAFE_DUMMY_HASH } from '../auth/password.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllUserSessions,
} from '../auth/tokens.js';
import { errors } from '../lib/errors.js';
import { env } from '../config/env.js';
import { slugify } from '../lib/ids.js';
import { redis } from '../lib/redis.js';
import { issueMfaChallenge, makeChallengeKey } from '../auth/mfa.js';
import { notify } from '../services/notify.js';
import { sendSystemMail } from '../services/systemMail.js';
import crypto from 'node:crypto';
import argon2 from 'argon2';

function renderResetHtml(name: string, link: string): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;line-height:1.5;padding:24px;max-width:560px;margin:0 auto">
<h2 style="color:#087443;margin:0 0 12px 0">Reset your Cloud Mail password</h2>
<p>Hi ${esc(name)},</p>
<p>Someone (hopefully you) asked to reset the password for your Cloud Mail account. Click the button below to choose a new password. The link expires in 60 minutes.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#159447;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Reset password</a></p>
<p style="color:#475569;font-size:13px">If the button doesn't work, paste this URL into your browser:<br/><span style="word-break:break-all">${esc(link)}</span></p>
<p style="color:#475569;font-size:13px">If you didn't request this, ignore this email — your password won't change.</p>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
<p style="color:#94a3b8;font-size:12px">The Cloud Mail team</p>
</body></html>`;
}

async function notifyNewLoginIfNovel(userId: string, ipAddress: string, userAgent: string | undefined): Promise<void> {
  // "Novel" = we've never seen this (userId, ipAddress) tuple succeed before.
  const prior = await prisma.loginAttempt.count({
    where: { userId, ipAddress, success: true },
  });
  // The freshly-inserted attempt already counts, so treat "1" as first-ever.
  if (prior > 1) return;
  await notify({
    userId,
    kind: 'security_new_login',
    title: 'New sign-in to your account',
    body: `${userAgent ? userAgent.slice(0, 120) : 'Unknown device'} · ${ipAddress}`,
  });
}

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── POST /v1/auth/signup ─────────────────────────────────────
   * Creates a user AND a tenant (org) owned by that user. Registration is
   * open in dev; in prod this endpoint should be gated by invite/plan.
   */
  fastify.post('/signup', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      const body = z
        .object({
          email: z.string().email().max(255),
          password: z.string().min(10).max(200),
          name: z.string().min(1).max(120),
          organizationName: z.string().min(1).max(120),
        })
        .parse(req.body);

      const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (existing) throw errors.conflict('email_taken', 'Email is already in use');

      const passwordHash = await hashPassword(body.password);
      let slug = slugify(body.organizationName);
      // Guarantee slug uniqueness
      for (let attempt = 0; attempt < 5; attempt++) {
        const clash = await prisma.tenant.findUnique({ where: { slug } });
        if (!clash) break;
        slug = `${slugify(body.organizationName)}-${Math.floor(Math.random() * 9999)}`;
      }

      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email: body.email.toLowerCase(), name: body.name, passwordHash },
        });
        const t = await tx.tenant.create({
          data: { slug, name: body.organizationName },
        });
        await tx.tenantMember.create({
          data: { tenantId: t.id, userId: u.id, role: 'owner' },
        });
        await tx.auditEvent.create({
          data: {
            tenantId: t.id,
            actorUserId: u.id,
            action: 'tenant.created',
            metadata: { name: t.name },
            ipAddress: req.ip,
          },
        });
        return u;
      });

      const refresh = await issueRefreshToken(user.id, null, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      const access = signAccessToken(user.id);
      setRefreshCookie(reply, refresh.token, refresh.expiresAt);
      return { accessToken: access, expiresIn: env.JWT_ACCESS_TTL };
    },
  });

  /* ─── POST /v1/auth/login ─────────────────────────────────────── */
  fastify.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    handler: async (req, reply) => {
      const body = z
        .object({
          email: z.string().email().max(255),
          password: z.string().min(1).max(200),
        })
        .parse(req.body);

      const email = body.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      const passOk = user
        ? await verifyPassword(user.passwordHash, body.password)
        : (await verifyPassword(TIMING_SAFE_DUMMY_HASH, body.password), false);

      await prisma.loginAttempt.create({
        data: {
          userId: user?.id ?? null,
          email,
          ipAddress: req.ip,
          success: Boolean(user) && passOk,
          reason: !user ? 'no_user' : passOk ? null : 'bad_password',
        },
      });

      if (!user || !passOk) throw errors.unauthorized('bad_credentials', 'Invalid email or password');
      if (user.status !== 'active') throw errors.forbidden('user_inactive', 'This account is not active');

      // If MFA is on, don't hand out tokens yet — issue a challenge and let
      // the client finish via /v1/auth/mfa/challenge.
      if (user.mfaEnabled && user.mfaSecret) {
        const c = issueMfaChallenge();
        await redis.set(makeChallengeKey(c.hash), user.id, 'PX', 5 * 60 * 1000);
        return { needsMfa: true, challenge: c.challenge, expiresIn: 300 };
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      const refresh = await issueRefreshToken(user.id, null, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      const access = signAccessToken(user.id);
      setRefreshCookie(reply, refresh.token, refresh.expiresAt);
      void notifyNewLoginIfNovel(user.id, req.ip, req.headers['user-agent']);
      return { accessToken: access, expiresIn: env.JWT_ACCESS_TTL };
    },
  });

  /* ─── POST /v1/auth/forgot ────────────────────────────────────── */
  fastify.post('/forgot', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (req, reply) => {
      const body = z.object({ email: z.string().email().max(255) }).parse(req.body);
      const email = body.email.toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      // Always respond 202 — do NOT leak account existence via response shape
      // or timing. We short-circuit the DB write when no user exists but still
      // do the argon2 hash pass to keep timings roughly comparable.
      if (user) {
        // Rate-limit per-user separately from per-IP to make targeted
        // enumeration less effective. Max 3 outstanding tokens per hour.
        const recent = await prisma.passwordReset.count({
          where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
        });
        if (recent < 3) {
          const plainToken = crypto.randomBytes(32).toString('base64url');
          const tokenHash = await argon2.hash(plainToken, { type: argon2.argon2id });
          await prisma.passwordReset.create({
            data: {
              userId: user.id,
              tokenHash,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'] ?? null,
              expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
            },
          });
          const link = `${env.PUBLIC_APP_URL}/reset?token=${encodeURIComponent(plainToken)}&uid=${encodeURIComponent(user.id)}`;
          await sendSystemMail({
            to: user.email,
            subject: 'Reset your Cloud Mail password',
            text: `Hi ${user.name},

Someone (hopefully you) asked to reset the password for your Cloud Mail account.

Click here to choose a new password — the link expires in 60 minutes:
${link}

If you didn't request this, you can ignore this email — your password won't change.

— The Cloud Mail team`,
            html: renderResetHtml(user.name, link),
          });
        }
      } else {
        // Timing-equalize: burn the equivalent argon2 CPU so a curl-based
        // enumeration attempt can't tell the difference between real + fake.
        await argon2.hash(crypto.randomBytes(32).toString('hex'), { type: argon2.argon2id });
      }

      reply.code(202);
      return { ok: true };
    },
  });

  /* ─── POST /v1/auth/reset ─────────────────────────────────────── */
  fastify.post('/reset', {
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    handler: async (req) => {
      const body = z
        .object({
          userId: z.string().min(10),
          token: z.string().min(20).max(200),
          password: z.string().min(10).max(200),
        })
        .parse(req.body);

      const candidates = await prisma.passwordReset.findMany({
        where: {
          userId: body.userId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      if (candidates.length === 0)
        throw errors.unauthorized('invalid_or_expired', 'Reset link is invalid or expired');

      let matched: (typeof candidates)[number] | null = null;
      for (const c of candidates) {
        try {
          if (await argon2.verify(c.tokenHash, body.token)) {
            matched = c;
            break;
          }
        } catch {
          /* argon2 verify failure isn't fatal — try the next candidate */
        }
      }
      if (!matched) throw errors.unauthorized('invalid_or_expired', 'Reset link is invalid or expired');

      const newHash = await hashPassword(body.password);
      await prisma.$transaction([
        prisma.user.update({ where: { id: body.userId }, data: { passwordHash: newHash } }),
        prisma.passwordReset.update({ where: { id: matched.id }, data: { usedAt: new Date() } }),
      ]);

      // Any active session on the old password becomes untrusted after a reset.
      await revokeAllUserSessions(body.userId);

      // Fire-and-forget audit + notification.
      const memberships = await prisma.tenantMember.findMany({ where: { userId: body.userId } });
      await prisma.auditEvent.createMany({
        data: memberships.map((m) => ({
          tenantId: m.tenantId,
          actorUserId: body.userId,
          action: 'user.password_reset',
          ipAddress: req.ip,
        })),
      });
      void notify({
        userId: body.userId,
        kind: 'security_password_changed',
        title: 'Your Cloud Mail password was reset',
        body: `From ${req.ip}. If this was not you, contact support immediately.`,
      });

      return { ok: true };
    },
  });

  /* ─── POST /v1/auth/refresh ───────────────────────────────────── */
  fastify.post('/refresh', {
    handler: async (req, reply) => {
      const cookieToken = req.cookies['cm_rt'];
      if (!cookieToken) throw errors.unauthorized('refresh_missing');

      const { access, refresh } = await rotateRefreshToken(cookieToken, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      setRefreshCookie(reply, refresh.token, refresh.expiresAt);
      return { accessToken: access, expiresIn: env.JWT_ACCESS_TTL };
    },
  });

  /* ─── POST /v1/auth/logout ────────────────────────────────────── */
  fastify.post('/logout', {
    handler: async (req, reply) => {
      const cookieToken = req.cookies['cm_rt'];
      if (cookieToken) {
        try {
          // Rotate silently to burn the current token; then revoke the whole family.
          const { userId } = await rotateRefreshToken(cookieToken, {
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
          });
          await revokeAllUserSessions(userId);
        } catch {
          /* already invalid — no-op */
        }
      }
      reply.clearCookie('cm_rt', { path: '/v1/auth' });
      return { ok: true };
    },
  });

  /* ─── GET /v1/auth/me ─────────────────────────────────────────── */
  fastify.get('/me', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const user = req.currentUser!;
      const memberships = await prisma.tenantMember.findMany({
        where: { userId: user.id },
        include: { tenant: true },
      });
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          lastLoginAt: user.lastLoginAt,
        },
        tenants: memberships.map((m) => ({
          id: m.tenant.id,
          slug: m.tenant.slug,
          name: m.tenant.name,
          role: m.role,
          plan: m.tenant.plan,
          status: m.tenant.status,
        })),
      };
    },
  });
};

function setRefreshCookie(
  reply: import('fastify').FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie('cm_rt', token, {
    path: '/v1/auth',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
  });
}

export default routes;
