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

      // A mailbox and its owner-User share the SAME argon2id credential.
      // Rationale: the tenant admin sets one password when creating the
      // mailbox; the owner must be able to use that one password for both
      // webmail (User.passwordHash via /v1/auth/login) and IMAP/SMTP
      // (Mailbox.passwordHash via Dovecot). Storing it once, hashed twice
      // (via one hash re-used) keeps the two auth surfaces from drifting.
      const passwordHash = await hashPassword(body.password);

      // If a User with this email already exists globally, we cannot
      // silently attach — that would let a tenant admin hijack an unrelated
      // account by creating a matching-address mailbox. Refuse loudly.
      const clashingUser = await prisma.user.findUnique({ where: { email: address } });
      if (clashingUser) {
        throw errors.conflict(
          'email_taken_globally',
          `A MailCloud user with ${address} already exists; ` +
            `pick a different local part or contact support to reconcile.`,
        );
      }

      const { mailbox } = await prisma.$transaction(async (tx) => {
        const createdMailbox = await tx.mailbox.create({
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

        // The application-identity User that logs into webmail. Same email
        // as the mailbox address, same passwordHash. Linked into the tenant
        // as role=member with mailboxId set so resolveMailboxForRequest()
        // finds it without needing an X-Cloudmail-Mailbox header.
        const createdUser = await tx.user.create({
          data: {
            email: address,
            name: body.displayName ?? body.localPart,
            passwordHash,
            status: 'active',
          },
        });

        await tx.tenantMember.create({
          data: {
            tenantId,
            userId: createdUser.id,
            role: 'member',
            mailboxId: createdMailbox.id,
          },
        });

        return { mailbox: createdMailbox, user: createdUser };
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

      // Mirror mailbox status onto the owner-User so a suspended/disabled
      // mailbox actually blocks webmail login too — /v1/auth/login rejects
      // any User whose status is not 'active'. Without this, an admin could
      // suspend a mailbox and the owner would still successfully sign in
      // to a broken empty inbox (mail routes fail, login succeeds — a
      // confusing half-locked state).
      //
      // Mapping: mailbox 'active' -> user 'active', anything else -> 'suspended'.
      // We only touch the owner-User when status is actually changing.
      const ownerMembership = body.status !== undefined
        ? await prisma.tenantMember.findFirst({
            where: { tenantId: req.currentTenant!.id, mailboxId: mailbox.id, role: 'member' },
          })
        : null;
      const nextUserStatus = body.status === 'active' ? 'active' : 'suspended';

      const [updated] = await prisma.$transaction([
        prisma.mailbox.update({
          where: { id: mailbox.id },
          data: {
            ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
            ...(body.quotaBytes !== undefined ? { quotaBytes: body.quotaBytes } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
          },
        }),
        ...(ownerMembership && body.status !== undefined
          ? [prisma.user.update({ where: { id: ownerMembership.userId }, data: { status: nextUserStatus } })]
          : []),
      ]);
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
      // Keep the mailbox's owner-User in sync (webmail credential) so a
      // password reset doesn't leave IMAP working but webmail broken (or
      // vice versa). The owner-User is found via TenantMember.mailboxId.
      const ownerMembership = await prisma.tenantMember.findFirst({
        where: { tenantId: req.currentTenant!.id, mailboxId: mailbox.id, role: 'member' },
      });
      await prisma.$transaction([
        prisma.mailbox.update({ where: { id: mailbox.id }, data: { passwordHash } }),
        ...(ownerMembership
          ? [prisma.user.update({ where: { id: ownerMembership.userId }, data: { passwordHash } })]
          : []),
      ]);
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
  //
  // Soft-delete only. The mailbox row is marked pending_deletion; a future
  // purge worker (not yet implemented) will remove the Maildir on disk and
  // hard-delete the DB rows once retention policy allows. This preserves
  // the option to restore accidentally-deleted mailboxes.
  //
  // What this handler DOES on the same request:
  //   1. mailbox.status = 'pending_deletion' — hides mail routes.
  //   2. owner-User.status = 'suspended' — immediately blocks webmail login
  //      (Task 13 sync rule). The owner cannot log in and then find their
  //      mail gone with no explanation.
  //   3. Revoke all of the owner-User's active refresh tokens — any active
  //      web session ends on the next refresh attempt.
  //   4. Audit under 'mailbox.deleted'.
  //
  // What this handler does NOT do (deferred to a future purge worker):
  //   - Delete the User row.  Preserves it in case restore is requested,
  //     and avoids orphaning any tenantMember in a DIFFERENT tenant that
  //     happens to reference the same User.
  //   - Delete the mailbox row.
  //   - rm -rf /var/vmail/<domain>/<localpart>.
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'owner')],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mailbox = await loadTenantMailbox(req.currentTenant!.id, id);
      const ownerMembership = await prisma.tenantMember.findFirst({
        where: { tenantId: req.currentTenant!.id, mailboxId: mailbox.id, role: 'member' },
      });
      await prisma.$transaction([
        prisma.mailbox.update({
          where: { id: mailbox.id },
          data: { status: 'pending_deletion' },
        }),
        ...(ownerMembership
          ? [
              prisma.user.update({
                where: { id: ownerMembership.userId },
                data: { status: 'suspended' },
              }),
              prisma.refreshToken.updateMany({
                where: { userId: ownerMembership.userId, revokedAt: null },
                data: { revokedAt: new Date() },
              }),
            ]
          : []),
      ]);
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'mailbox.deleted',
          targetType: 'mailbox',
          targetId: mailbox.id,
          metadata: {
            address: mailbox.address,
            ownerUserSuspended: Boolean(ownerMembership),
          },
          ipAddress: req.ip,
        },
      });
      reply.code(202);
      return { status: 'pending_deletion', ownerUserSuspended: Boolean(ownerMembership) };
    },
  });
};

async function loadTenantMailbox(tenantId: string, id: string) {
  const m = await prisma.mailbox.findFirst({ where: { id, tenantId } });
  if (!m) throw errors.notFound('mailbox_not_found');
  return m;
}

export default routes;
