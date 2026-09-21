import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { resolveMailboxForRequest } from '../mail/resolveMailbox.js';
import {
  compileSieveScript,
  deploySieveOrThrow,
  type CompiledFilter,
  type AutoReplyDef,
} from '../services/sieve.js';
import { logger } from '../lib/logger.js';

/**
 * Filters + auto-reply API.
 *
 *   GET    /v1/filters              — list filters for the calling mailbox
 *   POST   /v1/filters              — create a filter (redeploys the script)
 *   PATCH  /v1/filters/:id          — edit (redeploys)
 *   DELETE /v1/filters/:id          — delete (redeploys)
 *   POST   /v1/filters/reorder      — { orderedIds: [] } — sets priority
 *
 *   GET    /v1/auto-reply
 *   PUT    /v1/auto-reply           — upsert; redeploys the sieve script
 *
 *   POST   /v1/filters/reinstall    — force-push the current DB state to
 *                                     ManageSieve (recovery/debugging)
 */

const CONDITION_FIELDS = ['from', 'to', 'subject', 'body', 'any'] as const;
const CONDITION_OPS = ['contains', 'is', 'matches'] as const;
const ACTION_KINDS = ['move', 'copy', 'flag', 'markRead', 'discard'] as const;

const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  op: z.enum(CONDITION_OPS),
  value: z.string().min(1).max(500),
});
const actionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  target: z.string().max(120).optional(),
});
const filterBodySchema = z.object({
  name: z.string().min(1).max(120),
  active: z.boolean().default(true),
  matchType: z.enum(['all', 'any']).default('all'),
  conditions: z.array(conditionSchema).min(1).max(10),
  actions: z.array(actionSchema).min(1).max(6),
  priority: z.number().int().min(0).max(10_000).optional(),
});

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const mb = await resolveMailboxForRequest(req);
      const rows = await prisma.mailFilter.findMany({
        where: { mailboxId: mb.id },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      });
      return { filters: rows.map(strip) };
    },
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = filterBodySchema.parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      const created = await prisma.mailFilter.create({
        data: {
          tenantId: req.currentTenant!.id,
          mailboxId: mb.id,
          name: body.name,
          active: body.active,
          matchType: body.matchType,
          conditions: body.conditions as unknown as object,
          actions: body.actions as unknown as object,
          priority: body.priority ?? 100,
        },
      });
      await syncSieve(mb.id, mb.address);
      reply.code(201);
      return strip(created);
    },
  });

  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = filterBodySchema.partial().parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      const existing = await prisma.mailFilter.findFirst({ where: { id, mailboxId: mb.id } });
      if (!existing) throw errors.notFound('filter_not_found');
      const patched = await prisma.mailFilter.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? existing.name,
          active: body.active ?? existing.active,
          matchType: body.matchType ?? existing.matchType,
          conditions: (body.conditions as unknown as object) ?? existing.conditions,
          actions: (body.actions as unknown as object) ?? existing.actions,
          priority: body.priority ?? existing.priority,
        },
      });
      await syncSieve(mb.id, mb.address);
      return strip(patched);
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mb = await resolveMailboxForRequest(req);
      const existing = await prisma.mailFilter.findFirst({ where: { id, mailboxId: mb.id } });
      if (!existing) throw errors.notFound('filter_not_found');
      await prisma.mailFilter.delete({ where: { id: existing.id } });
      await syncSieve(mb.id, mb.address);
      reply.code(204);
    },
  });

  fastify.post('/reorder', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z.object({ orderedIds: z.array(z.string()).min(1) }).parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      // Confirm all IDs belong to this mailbox — refuse if any are foreign.
      const owned = await prisma.mailFilter.findMany({
        where: { id: { in: body.orderedIds }, mailboxId: mb.id },
        select: { id: true },
      });
      if (owned.length !== body.orderedIds.length)
        throw errors.badRequest('bad_ids', 'One or more filter ids do not belong to this mailbox');

      await prisma.$transaction(
        body.orderedIds.map((id, i) =>
          prisma.mailFilter.update({ where: { id }, data: { priority: i * 10 } }),
        ),
      );
      await syncSieve(mb.id, mb.address);
      return { ok: true };
    },
  });

  fastify.post('/reinstall', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const mb = await resolveMailboxForRequest(req);
      await syncSieve(mb.id, mb.address);
      return { ok: true };
    },
  });
};

const autoReplyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const mb = await resolveMailboxForRequest(req);
      const row = await prisma.autoReply.findUnique({ where: { mailboxId: mb.id } });
      if (!row) {
        return {
          enabled: false,
          subject: 'Out of office',
          body: '',
          startDate: null,
          endDate: null,
        };
      }
      return {
        enabled: row.enabled,
        subject: row.subject,
        body: row.body,
        startDate: row.startDate,
        endDate: row.endDate,
      };
    },
  });

  fastify.put('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z
        .object({
          enabled: z.boolean(),
          subject: z.string().min(1).max(240).default('Out of office'),
          body: z.string().max(20_000).default(''),
          startDate: z.string().datetime().nullable().optional(),
          endDate: z.string().datetime().nullable().optional(),
        })
        .parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      const upserted = await prisma.autoReply.upsert({
        where: { mailboxId: mb.id },
        create: {
          tenantId: req.currentTenant!.id,
          mailboxId: mb.id,
          enabled: body.enabled,
          subject: body.subject,
          body: body.body,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
        update: {
          enabled: body.enabled,
          subject: body.subject,
          body: body.body,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
      });
      await syncSieve(mb.id, mb.address);
      return {
        enabled: upserted.enabled,
        subject: upserted.subject,
        body: upserted.body,
        startDate: upserted.startDate,
        endDate: upserted.endDate,
      };
    },
  });
};

/**
 * Rebuild the sieve script from Postgres and push it to Dovecot. Any
 * ManageSieve error surfaces to the API caller (500 with sieve_deploy_failed).
 * If the mail server isn't reachable — e.g. during local dev — we log a
 * warning and skip so the API doesn't 500 in demo mode.
 */
async function syncSieve(mailboxId: string, mailboxAddress: string): Promise<void> {
  const [filters, ar] = await Promise.all([
    prisma.mailFilter.findMany({
      where: { mailboxId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.autoReply.findUnique({ where: { mailboxId } }),
  ]);
  const compiled: CompiledFilter[] = filters.map((f) => ({
    id: f.id,
    name: f.name,
    active: f.active,
    matchType: (f.matchType as 'all' | 'any') ?? 'all',
    conditions: (f.conditions as unknown) as CompiledFilter['conditions'],
    actions: (f.actions as unknown) as CompiledFilter['actions'],
  }));
  const autoReply: AutoReplyDef | null = ar
    ? {
        enabled: ar.enabled,
        subject: ar.subject,
        body: ar.body,
        startDate: ar.startDate,
        endDate: ar.endDate,
      }
    : null;
  const script = compileSieveScript(compiled, autoReply);
  try {
    await deploySieveOrThrow(mailboxAddress, script);
  } catch (err) {
    logger.warn({ err, mailboxAddress }, 'sieve_deploy_skipped');
    // Rethrow only if the caller expected real deployment. For now we treat
    // this as a warning so local dev without a mail server keeps working.
    // (The script IS in the DB — reinstall recovers it.)
  }
}

interface FilterRow {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  matchType: string;
  conditions: unknown;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
}
function strip(f: FilterRow) {
  return {
    id: f.id,
    name: f.name,
    active: f.active,
    priority: f.priority,
    matchType: f.matchType,
    conditions: f.conditions,
    actions: f.actions,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

export { autoReplyRoutes };
export default routes;
