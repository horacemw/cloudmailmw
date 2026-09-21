import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

/**
 * "Sessions" == active refresh-token rows for the current user. We show a
 * compact device fingerprint (user-agent + IP) and let the user revoke any
 * one of them, or all except the current one.
 */

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const rows = await prisma.refreshToken.findMany({
        where: { userId: req.currentUser!.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        sessions: rows.map((r) => ({
          id: r.id,
          userAgent: r.userAgent,
          ipAddress: r.ipAddress,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        })),
      };
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const row = await prisma.refreshToken.findFirst({
        where: { id, userId: req.currentUser!.id },
      });
      if (!row) throw errors.notFound('session_not_found');
      await prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      reply.code(204);
    },
  });

  fastify.post('/revoke-all', {
    preHandler: [fastify.requireAuth],
    handler: async (req) => {
      const result = await prisma.refreshToken.updateMany({
        where: { userId: req.currentUser!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { revoked: result.count };
    },
  });
};

export default routes;
