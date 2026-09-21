import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { hashPassword } from '../auth/password.js';
import { notifyTenantAdmins } from '../services/notify.js';
import { syncMailboxUsage } from '../services/quotaSync.js';

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── GET /v1/mailboxes ───────────────────────────────────────── */
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const query = z
        .object({
          domainId: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        })
        .parse(req.query);

      const rows = await prisma.mailbox.findMany({
        where: {
          tenantId: req.currentTenant!.id,
          ...(query.domainId ? { domainId: query.domainId } : {}),
        },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: 'asc' }],
        include: { domain: true },
      });

      const nextCursor = rows.length > query.limit ? rows.pop()!.id : null;
      return {
        mailboxes: rows.map((m) => ({
          id: m.id,
          address: m.address,
          localPart: m.localPart,
          displayName: m.displayName,
          domain: { id: m.domain.id, name: m.domain.name },
          quotaBytes: m.quotaBytes.toString(),
          usedBytes: m.usedBytes.toString(),
          status: m.status,
          lastLoginAt: m.lastLoginAt,
          createdAt: m.createdAt,
        })),
        nextCursor,
      };
    },
  });

  /* ─── POST /v1/mailboxes ──────────────────────────────────────── */
  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const body = z
        .object({
          domainId: z.string(),
          localPart: z.string().transform((v) => v.trim().toLowerCase()),
          displayName: z.string().max(120).optional(),
          password: z.string().min(10).max(200),
          quotaBytes: z
            .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
            .optional()
            .transform((v) => (v === undefined ? undefined : BigInt(v as string | number))),
        })
        .parse(req.body);

      if (!LOCAL_PART_RE.test(body.localPart))
        throw errors.badRequest('invalid_local_part', 'Local part contains invalid characters');

      const tenantId = req.currentTenant!.id;
      const domain = await prisma.domain.findFirst({ where: { id: body.domainId, tenantId } });
      if (!domain) throw errors.notFound('domain_not_found');
      if (domain.status !== 'active' && domain.status !== 'verified')
        throw errors.badRequest('domain_not_ready', 'Verify the domain before creating mailboxes');

      const address = `${body.localPart}@${domain.name}`;
      const existing = await prisma.mailbox.findFirst({
        where: { OR: [{ address }, { AND: [{ domainId: domain.id }, { localPart: body.localPart }] }] },
      });
      if (existing) throw errors.conflict('mailbox_taken', `Mailbox ${address} already exists`);

      const passwordHash = await hashPassword(body.password);
      const mailbox = await prisma.mailbox.create({
        data: {
          tenantId,
          domainId: domain.id,
          localPart: body.localPart,
          address,
          displayName: body.displayName ?? null,
          passwordHash,
          ...(body.quotaBytes !== undefined ? { quotaBytes: body.quotaBytes } : {}),
        },
      });

      await prisma.auditEvent.create({
        data: {
          tenantId,
          actorUserId: req.currentUser!.id,
          action: 'mailbox.created',
          targetType: 'mailbox',
          targetId: mailbox.id,
          metadata: { address: mailbox.address },
          ipAddress: req.ip,
        },
      });
      await notifyTenantAdmins({
        tenantId,
        kind: 'mailbox_created',
        title: `Mailbox created`,
        body: `${mailbox.address} is now ready to receive mail.`,
        targetType: 'mailbox',
        targetId: mailbox.id,
      });

      reply.code(201);
      return {
        id: mailbox.id,
        address: mailbox.address,
        quotaBytes: mailbox.quotaBytes.toString(),
        status: mailbox.status,
      };
    },
  });

  /* ─── PATCH /v1/mailboxes/:id  (change quota, display name, status) ─ */
  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z
        .object({
          displayName: z.string().max(120).nullable().optional(),
          quotaBytes: z
            .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
            .optional()
            .transform((v) => (v === undefined ? undefined : BigInt(v as string | number))),
          status: z.enum(['active', 'suspended', 'disabled']).optional(),
        })
        .parse(req.body);
      const mailbox = await loadTenantMailbox(req.currentTenant!.id, id);
      const updated = await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: {
          ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
          ...(body.quotaBytes !== undefined ? { quotaBytes: body.quotaBytes } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'mailbox.updated',
          targetType: 'mailbox',
          targetId: mailbox.id,
          // BigInt cannot land in a Json column — stringify before persisting.
          metadata: JSON.parse(
            JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
          ),
          ipAddress: req.ip,
        },
      });
      return { id: updated.id, status: updated.status };
    },
  });

  /* ─── POST /v1/mailboxes/:id/password ──────────────────────────── */
  fastify.post('/:id/password', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z.object({ password: z.string().min(10).max(200) }).parse(req.body);
      const mailbox = await loadTenantMailbox(req.currentTenant!.id, id);
      const passwordHash = await hashPassword(body.password);
      await prisma.mailbox.update({ where: { id: mailbox.id }, data: { passwordHash } });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'mailbox.password_reset',
          targetType: 'mailbox',
          targetId: mailbox.id,
          ipAddress: req.ip,
        },
      });
      await notifyTenantAdmins({
        tenantId: req.currentTenant!.id,
        kind: 'mailbox_password_reset',
        title: `Password reset: ${mailbox.address}`,
        body: 'The mailbox owner needs the new password to sign in on their client.',
        targetType: 'mailbox',
        targetId: mailbox.id,
      });
      return { ok: true };
    },
  });

  /* ─── POST /v1/mailboxes/:id/sync-usage ─ refresh usedBytes from Dovecot ─ */
  fastify.post('/:id/sync-usage', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mailbox = await loadTenantMailbox(req.currentTenant!.id, id);
      await syncMailboxUsage(mailbox.id);
      const fresh = await prisma.mailbox.findUnique({ where: { id: mailbox.id } });
      return {
        id: fresh!.id,
        address: fresh!.address,
        usedBytes: fresh!.usedBytes.toString(),
        quotaBytes: fresh!.quotaBytes.toString(),
      };
    },
  });

  /* ─── DELETE /v1/mailboxes/:id ─────────────────────────────────── */
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'owner')],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mailbox = await loadTenantMailbox(req.currentTenant!.id, id);
      // Soft delete: mark pending, background job will clean up Dovecot storage.
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { status: 'pending_deletion' },
      });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'mailbox.deleted',
          targetType: 'mailbox',
          targetId: mailbox.id,
          metadata: { address: mailbox.address },
          ipAddress: req.ip,
        },
      });
      reply.code(202);
      return { status: 'pending_deletion' };
    },
  });
};

async function loadTenantMailbox(tenantId: string, id: string) {
  const m = await prisma.mailbox.findFirst({ where: { id, tenantId } });
  if (!m) throw errors.notFound('mailbox_not_found');
  return m;
}

export default routes;
