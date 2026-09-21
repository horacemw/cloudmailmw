import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

/**
 * Platform-admin ("super admin") endpoints. Gated by:
 *   - user.isPlatformAdmin === true, OR
 *   - user.email listed in PLATFORM_ADMIN_EMAILS env var (bootstrap path)
 *
 * Everything here is TENANT-BLIND (that's the whole point of platform admin),
 * so every response is careful never to leak a bare mailbox password, secret,
 * TOTP secret, or refresh-token hash. Data returned is metadata only.
 */

async function requirePlatformAdmin(req: FastifyRequest): Promise<void> {
  const user = req.currentUser;
  if (!user) throw errors.unauthorized();
  if (user.isPlatformAdmin) return;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(user.email.toLowerCase())) {
    throw errors.forbidden('platform_admin_only', 'Platform administrator access required');
  }
}

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── Overview: high-level real counters ───────────────────── */
  fastify.get('/overview', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      const [tenants, users, domains, mailboxes, mailboxUsedBytes, aliases, activeMigrations, activeExports, recentAudit] =
        await Promise.all([
          prisma.tenant.count(),
          prisma.user.count(),
          prisma.domain.count(),
          prisma.mailbox.count(),
          prisma.mailbox.aggregate({ _sum: { usedBytes: true } }),
          prisma.alias.count(),
          prisma.migrationJob.count({ where: { status: { in: ['queued', 'running'] } } }),
          prisma.exportJob.count({ where: { status: { in: ['queued', 'running'] } } }),
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
          tenants, users, domains, mailboxes, aliases,
          activeMigrations, activeExports,
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
};

function runCommand(cmd: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `exit ${code}`))));
    p.on('error', reject);
  });
}

export default routes;
