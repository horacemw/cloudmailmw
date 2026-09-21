import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

/**
 * User-facing notifications API.
 *
 *   GET    /v1/notifications                  paginated list
 *   GET    /v1/notifications/unread-count     small poll target for the bell
 *   POST   /v1/notifications/:id/read
 *   POST   /v1/notifications/read-all
 *   DELETE /v1/notifications/:id
 *
 * Tenant header is optional here — a user's notifications include events
 * from every tenant they're a member of.
 */

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          before: z.string().optional(),
          unreadOnly: z.coerce.boolean().default(false),
        })
        .parse(req.query);
      const rows = await prisma.notification.findMany({
        where: {
          userId: req.currentUser!.id,
          ...(q.unreadOnly ? { readAt: null } : {}),
          ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      });
      return {
        notifications: rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          targetType: n.targetType,
          targetId: n.targetId,
          readAt: n.readAt,
          createdAt: n.createdAt,
        })),
      };
    },
  });

  fastify.get('/unread-count', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const count = await prisma.notification.count({
        where: { userId: req.currentUser!.id, readAt: null },
      });
      return { count };
    },
  });

  fastify.post('/:id/read', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const n = await prisma.notification.findFirst({
        where: { id, userId: req.currentUser!.id },
      });
      if (!n) throw errors.notFound('notification_not_found');
      if (!n.readAt) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { readAt: new Date() },
        });
      }
      return { ok: true };
    },
  });

  fastify.post('/read-all', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const r = await prisma.notification.updateMany({
        where: { userId: req.currentUser!.id, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: r.count };
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const n = await prisma.notification.findFirst({
        where: { id, userId: req.currentUser!.id },
      });
      if (!n) throw errors.notFound('notification_not_found');
      await prisma.notification.delete({ where: { id: n.id } });
      reply.code(204);
    },
  });
};

export default routes;
