import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { env } from '../config/env.js';

/**
 * Platform-admin ("super admin") endpoints. Gated by:
 *   - user.isPlatformAdmin === true, OR
 *   - user.email listed in PLATFORM_ADMIN_EMAILS env var (bootstrap path)
 *
 * When env.PLATFORM_ADMIN_REQUIRE_MFA is true, the caller must ALSO have
 * mfaEnabled — this is the "mandatory 2FA for platform admins" gate.
 *
 * Everything here is TENANT-BLIND (that's the whole point of platform admin),
 * so every response is careful never to leak a bare mailbox password, secret,
 * TOTP secret, or refresh-token hash. Data returned is metadata only.
 */

export async function requirePlatformAdmin(req: FastifyRequest): Promise<void> {
  const user = req.currentUser;
  if (!user) throw errors.unauthorized();
  const bootstrapEmails = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user.isPlatformAdmin || bootstrapEmails.includes(user.email.toLowerCase());
  if (!isAdmin) {
    throw errors.forbidden('platform_admin_only', 'Platform administrator access required');
  }
  if (env.PLATFORM_ADMIN_REQUIRE_MFA && !user.mfaEnabled) {
    throw errors.forbidden('mfa_required', 'Platform admins must enrol two-factor authentication before using admin endpoints');
  }
}

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── Overview: high-level real counters ───────────────────── */
  fastify.get('/overview', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [
        tenants,
        activeTenants,
        suspendedTenants,
        users,
        domains,
        verifiedDomains,
        mailboxes,
        activeMailboxes,
        mailboxUsedBytes,
        aliases,
        activeMigrations,
        activeExports,
        activeSessions,
        failedLoginsLast24h,
        recentAudit,
      ] = await Promise.all([
        prisma.tenant.count(),
        prisma.tenant.count({ where: { status: 'active' } }),
        prisma.tenant.count({ where: { status: 'suspended' } }),
        prisma.user.count(),
        prisma.domain.count(),
        prisma.domain.count({ where: { status: { in: ['verified', 'active'] } } }),
        prisma.mailbox.count(),
        prisma.mailbox.count({ where: { status: 'active' } }),
        prisma.mailbox.aggregate({ _sum: { usedBytes: true } }),
        prisma.alias.count(),
        prisma.migrationJob.count({ where: { status: { in: ['queued', 'running'] } } }),
        prisma.exportJob.count({ where: { status: { in: ['queued', 'running'] } } }),
        prisma.refreshToken.count({
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
        }),
        prisma.loginAttempt.count({
          where: { success: false, createdAt: { gte: twentyFourHoursAgo } },
        }),
        prisma.auditEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            id: true, tenantId: true, actorUserId: true, action: true, targetType: true,
            targetId: true, ipAddress: true, createdAt: true,
          },
        }),
      ]);
      return {
        counts: {
          tenants, activeTenants, suspendedTenants,
          users,
          domains, verifiedDomains,
          mailboxes, activeMailboxes,
          aliases,
          activeMigrations, activeExports,
          activeSessions,
          failedLoginsLast24h,
          storageUsedBytes: (mailboxUsedBytes._sum.usedBytes ?? BigInt(0)).toString(),
        },
        recentAudit,
      };
    },
  });

  /* ─── Tenants ──────────────────────────────────────────────── */
  fastify.get('/tenants', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const q = z
        .object({
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      const rows = await prisma.tenant.findMany({
        where: q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { slug: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { domains: true, mailboxes: true, members: true } },
        },
      });
      const nextCursor = rows.length > q.limit ? rows.pop()!.id : null;
      return {
        tenants: rows.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          plan: t.plan,
          status: t.status,
          createdAt: t.createdAt,
          domainCount: t._count.domains,
          mailboxCount: t._count.mailboxes,
          memberCount: t._count.members,
          storageQuotaBytes: t.storageQuotaBytes.toString(),
        })),
        nextCursor,
      };
    },
  });

  fastify.post('/tenants/:id/suspend', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const t = await prisma.tenant.update({ where: { id }, data: { status: 'suspended' } });
      await prisma.auditEvent.create({
        data: {
          tenantId: t.id,
          actorUserId: req.currentUser!.id,
          action: 'tenant.suspended.by_platform_admin',
          ipAddress: req.ip,
        },
      });
      return { id: t.id, status: t.status };
    },
  });

  fastify.post('/tenants/:id/restore', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const t = await prisma.tenant.update({ where: { id }, data: { status: 'active' } });
      await prisma.auditEvent.create({
        data: {
          tenantId: t.id,
          actorUserId: req.currentUser!.id,
          action: 'tenant.restored.by_platform_admin',
          ipAddress: req.ip,
        },
      });
      return { id: t.id, status: t.status };
    },
  });

  /* ─── Mailboxes across all tenants (read-only) ─────────────── */
  fastify.get('/mailboxes', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const q = z
        .object({
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      const rows = await prisma.mailbox.findMany({
        where: q.search ? { address: { contains: q.search, mode: 'insensitive' } } : undefined,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: {
          domain: { select: { name: true } },
          tenant: { select: { slug: true, name: true } },
        },
      });
      const nextCursor = rows.length > q.limit ? rows.pop()!.id : null;
      return {
        mailboxes: rows.map((m) => ({
          id: m.id,
          address: m.address,
          domain: m.domain.name,
          tenant: { slug: m.tenant.slug, name: m.tenant.name },
          status: m.status,
          quotaBytes: m.quotaBytes.toString(),
          usedBytes: m.usedBytes.toString(),
          lastLoginAt: m.lastLoginAt,
          createdAt: m.createdAt,
        })),
        nextCursor,
      };
    },
  });

  /* ─── Postfix mail queue (via `mailq`) ─────────────────────── */
  fastify.get('/queue', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      try {
        const raw = await runCommand('mailq');
        // Parse into rough counts. `mailq` output is heterogeneous — we
        // return the raw text (truncated) plus the summary line.
        const lines = raw.trim().split('\n');
        const summary = lines[lines.length - 1] ?? '';
        return {
          available: true,
          summary,
          entries: lines.length,
          raw: raw.slice(0, 20_000),
        };
      } catch (err) {
        return {
          available: false,
          error: err instanceof Error ? err.message : 'mailq not available',
        };
      }
    },
  });

  /* ─── Queue actions ─────────────────────────────────────────
   *  Backed by `sudo -n postsuper/postqueue` — the API user is `cloudmail`
   *  which cannot run these directly. The deploy installs a strict sudoers
   *  file (/etc/sudoers.d/cloudmail-mailq) that whitelists ONLY these three
   *  binaries with no wildcard arguments beyond a validated queue-id.
   *
   *  Queue IDs are validated with a strict regex before ever reaching the
   *  shell — Postfix queue IDs are hex characters, typically 9-15 long.
   *  Anything that doesn't match returns 400 without shelling out.
   */
  const qidSchema = z.object({ qid: z.string().regex(/^[A-F0-9]{6,15}$/, 'invalid queue id') });

  async function runQueueAction(
    req: FastifyRequest,
    qid: string,
    action: 'retry' | 'delete' | 'hold' | 'release',
  ): Promise<{ ok: true; action: string; qid: string; output: string }> {
    const argMap: Record<typeof action, [string, string[]]> = {
      retry:   ['/usr/sbin/postqueue', ['-i', qid]],
      delete:  ['/usr/sbin/postsuper', ['-d', qid]],
      hold:    ['/usr/sbin/postsuper', ['-h', qid]],
      release: ['/usr/sbin/postsuper', ['-H', qid]],
    };
    const [bin, args] = argMap[action];
    let output = '';
    try {
      output = await runCommand('sudo', ['-n', bin, ...args]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw errors.serviceUnavailable('queue_tool_unavailable', `Could not run ${action} on ${qid}: ${msg}`);
    }
    await prisma.auditEvent.create({
      data: {
        // Queue actions aren't scoped to a tenant — record against a synthetic
        // "platform" tenant marker in the metadata. Use the actor's first
        // tenant membership for the FK.
        tenantId: (await prisma.tenantMember.findFirst({ where: { userId: req.currentUser!.id } }))?.tenantId ?? '',
        actorUserId: req.currentUser!.id,
        action: `platform.mailq.${action}`,
        targetType: 'mailq',
        targetId: qid,
        ipAddress: req.ip,
        metadata: { output: output.slice(0, 500) },
      },
    });
    return { ok: true, action, qid, output: output.slice(0, 2_000) };
  }

  fastify.post('/queue/:qid/retry', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { qid } = qidSchema.parse(req.params);
      return runQueueAction(req, qid, 'retry');
    },
  });

  fastify.post('/queue/:qid/delete', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { qid } = qidSchema.parse(req.params);
      return runQueueAction(req, qid, 'delete');
    },
  });

  fastify.post('/queue/:qid/hold', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { qid } = qidSchema.parse(req.params);
      return runQueueAction(req, qid, 'hold');
    },
  });

  fastify.post('/queue/:qid/release', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const { qid } = qidSchema.parse(req.params);
      return runQueueAction(req, qid, 'release');
    },
  });

  fastify.post('/queue/flush', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      let output = '';
      try {
        output = await runCommand('sudo', ['-n', '/usr/sbin/postqueue', '-f']);
      } catch (err) {
        throw errors.serviceUnavailable('queue_tool_unavailable', err instanceof Error ? err.message : String(err));
      }
      await prisma.auditEvent.create({
        data: {
          tenantId: (await prisma.tenantMember.findFirst({ where: { userId: req.currentUser!.id } }))?.tenantId ?? '',
          actorUserId: req.currentUser!.id,
          action: 'platform.mailq.flush',
          targetType: 'mailq',
          ipAddress: req.ip,
        },
      });
      return { ok: true, action: 'flush', output: output.slice(0, 2_000) };
    },
  });

  /* ─── Audit log ────────────────────────────────────────────── */
  fastify.get('/audit', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).default(100),
          tenantId: z.string().optional(),
          action: z.string().optional(),
        })
        .parse(req.query);
      const rows = await prisma.auditEvent.findMany({
        where: {
          ...(q.tenantId ? { tenantId: q.tenantId } : {}),
          ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      });
      return { events: rows };
    },
  });

  /* ─── Security overview: real events, no fabrication ────── */
  fastify.get('/security', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async (req) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(500).default(50),
          hours: z.coerce.number().int().min(1).max(720).default(24),
        })
        .parse(req.query);

      const now = Date.now();
      const since24h = new Date(now - 24 * 60 * 60 * 1000);
      const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const sinceRange = new Date(now - q.hours * 60 * 60 * 1000);

      // Actions we consider security-relevant for the aggregated feed.
      const SECURITY_ACTIONS = [
        'mfa.enabled', 'mfa.disabled',
        'tenant.suspended.by_platform_admin', 'tenant.restored.by_platform_admin',
        'user.platform_admin_granted', 'user.platform_admin_revoked',
        'user.password_reset',
      ];

      const [failed24h, failed7d, success24h, success7d, recentFailed, recentSecurity] = await Promise.all([
        prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
        prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since7d } } }),
        prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: since24h } } }),
        prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: since7d } } }),
        prisma.loginAttempt.findMany({
          where: { success: false, createdAt: { gte: sinceRange } },
          orderBy: { createdAt: 'desc' },
          take: q.limit,
          select: { id: true, email: true, ipAddress: true, reason: true, createdAt: true, userId: true },
        }),
        prisma.auditEvent.findMany({
          where: { action: { in: SECURITY_ACTIONS }, createdAt: { gte: sinceRange } },
          orderBy: { createdAt: 'desc' },
          take: q.limit,
          select: { id: true, action: true, tenantId: true, actorUserId: true, targetType: true, targetId: true, ipAddress: true, createdAt: true, metadata: true },
        }),
      ]);

      return {
        window: { hours: q.hours, since: sinceRange.toISOString() },
        counts: {
          failedLogins24h: failed24h,
          failedLogins7d: failed7d,
          successfulLogins24h: success24h,
          successfulLogins7d: success7d,
        },
        recentFailedLogins: recentFailed,
        recentSecurityEvents: recentSecurity,
      };
    },
  });

  /* ─── System (real infrastructure status, no fabrication) ── */
  fastify.get('/system', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      const SERVICES = [
        'postfix', 'dovecot', 'rspamd', 'clamav-daemon',
        'nginx', 'cloudmail-api', 'cloudmail-worker',
        'fail2ban', 'ufw',
      ];
      const services = await Promise.all(
        SERVICES.map(async (name) => {
          try {
            // `systemctl is-active` returns exit 0 for active, non-zero otherwise;
            // its stdout is the state string ("active", "inactive", "failed", ...).
            const out = await runCommand('systemctl', ['is-active', name]);
            return { name, state: out.trim(), ok: out.trim() === 'active' };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // If systemctl exits non-zero we still capture the state string.
            const state = msg.trim().split(/\s+/).pop() ?? 'unknown';
            return { name, state, ok: false };
          }
        }),
      );

      const hostname = await runCommand('hostname').then((s) => s.trim()).catch(() => 'unavailable');

      const cert = await inspectCert(`/etc/letsencrypt/live/${env.CLOUDMAIL_INITIAL_MAIL_HOST}/cert.pem`);

      const fail2ban = await runCommand('fail2ban-client', ['status'])
        .then((out) => {
          // "Jail list:\tsshd, postfix, ..."
          const line = out.split('\n').find((l) => l.toLowerCase().includes('jail list'));
          const jails = line?.split(':').slice(1).join(':').split(',').map((s) => s.trim()).filter(Boolean) ?? [];
          return { available: true, jails };
        })
        .catch((err) => ({ available: false, jails: [] as string[], error: String(err instanceof Error ? err.message : err) }));

      return {
        hostname,
        publicMailHostname: env.CLOUDMAIL_INITIAL_MAIL_HOST,
        publicIpv4: env.CLOUDMAIL_INITIAL_IPV4,
        services,
        cert,
        fail2ban,
      };
    },
  });
};

async function inspectCert(path: string): Promise<
  | { available: true; notBefore: string; notAfter: string; daysUntilExpiry: number }
  | { available: false; reason: string }
> {
  try {
    await fs.access(path);
    const out = await runCommand('openssl', ['x509', '-in', path, '-noout', '-dates']);
    // notBefore=Sep 21 15:31:22 2026 GMT
    // notAfter=Dec 20 15:31:21 2026 GMT
    const nb = /^notBefore=(.+)$/m.exec(out)?.[1]?.trim();
    const na = /^notAfter=(.+)$/m.exec(out)?.[1]?.trim();
    if (!nb || !na) return { available: false, reason: 'unparseable openssl output' };
    const naDate = new Date(na);
    const daysUntilExpiry = Math.floor((naDate.getTime() - Date.now()) / 86_400_000);
    return { available: true, notBefore: nb, notAfter: na, daysUntilExpiry };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function runCommand(cmd: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || out.trim() || `exit ${code}`))));
    p.on('error', reject);
  });
}

export default routes;
