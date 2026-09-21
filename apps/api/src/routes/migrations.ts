import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { encryptSecret } from '../lib/crypto.js';
import { migrationQueue } from '../workers/queue.js';

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── POST /v1/migrations/test  (verify IMAP creds without persisting) ─ */
  fastify.post('/test', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    handler: async (req) => {
      const body = z
        .object({
          host: z.string().min(3),
          port: z.coerce.number().int().positive().default(993),
          secure: z.boolean().default(true),
          user: z.string().min(1),
          password: z.string().min(1),
        })
        .parse(req.body);

      const client = new ImapFlow({
        host: body.host,
        port: body.port,
        secure: body.secure,
        auth: { user: body.user, pass: body.password },
        logger: false,
      });
      try {
        await client.connect();
        const list = await client.list();
        return {
          ok: true,
          folders: list.length,
          samplePaths: list.slice(0, 5).map((f) => f.path),
        };
      } catch (err) {
        throw errors.unprocessable(
          'imap_connect_failed',
          err instanceof Error ? err.message : 'IMAP connection failed',
        );
      } finally {
        try {
          await client.logout();
        } catch {
          /* ignore */
        }
      }
    },
  });

  /* ─── POST /v1/migrations  (start a migration) ────────────────── */
  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const body = z
        .object({
          mailboxId: z.string(),
          host: z.string(),
          port: z.coerce.number().int().positive().default(993),
          secure: z.boolean().default(true),
          user: z.string(),
          password: z.string().min(1),
        })
        .parse(req.body);

      const mailbox = await prisma.mailbox.findFirst({
        where: { id: body.mailboxId, tenantId: req.currentTenant!.id },
      });
      if (!mailbox) throw errors.notFound('mailbox_not_found');

      const job = await prisma.migrationJob.create({
        data: {
          tenantId: req.currentTenant!.id,
          mailboxId: mailbox.id,
          sourceHost: body.host,
          sourcePort: body.port,
          sourceSecure: body.secure,
          sourceUser: body.user,
          sourceSecretCipher: encryptSecret(body.password),
        },
      });
      await migrationQueue.add(
        'migrate',
        { jobId: job.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'migration.started',
          targetType: 'mailbox',
          targetId: mailbox.id,
          metadata: { source: `${body.user}@${body.host}` },
          ipAddress: req.ip,
        },
      });
      reply.code(202);
      return { id: job.id, status: job.status };
    },
  });

  /* ─── GET /v1/migrations ──────────────────────────────────────── */
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.migrationJob.findMany({
        where: { tenantId: req.currentTenant!.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        migrations: rows.map((r) => ({
          id: r.id,
          mailboxId: r.mailboxId,
          source: `${r.sourceUser}@${r.sourceHost}`,
          status: r.status,
          totalMessages: r.totalMessages,
          processed: r.processed,
          failed: r.failed,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
        })),
      };
    },
  });

  /* ─── POST /v1/migrations/:id/cancel ──────────────────────────── */
  fastify.post('/:id/cancel', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const job = await prisma.migrationJob.findFirst({
        where: { id, tenantId: req.currentTenant!.id },
      });
      if (!job) throw errors.notFound('migration_not_found');
      await prisma.migrationJob.update({
        where: { id: job.id },
        data: { status: 'cancelled', finishedAt: new Date(), sourceSecretCipher: '' },
      });
      return { ok: true };
    },
  });
};

export default routes;
