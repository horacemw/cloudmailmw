import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.alias.findMany({
        where: { tenantId: req.currentTenant!.id },
        orderBy: { createdAt: 'asc' },
        include: { domain: true },
      });
      return {
        aliases: rows.map((a) => ({
          id: a.id,
          source: a.source,
          destinations: a.destinationRaw.split(',').map((s) => s.trim()),
          active: a.active,
          domain: { id: a.domain.id, name: a.domain.name },
        })),
      };
    },
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const body = z
        .object({
          domainId: z.string(),
          source: z
            .string()
            .transform((v) => v.trim().toLowerCase())
            .refine((v) => EMAIL_RE.test(v), 'source must be a valid email'),
          destinations: z.array(z.string().transform((s) => s.trim().toLowerCase())).min(1).max(20),
        })
        .parse(req.body);

      const tenantId = req.currentTenant!.id;
      const domain = await prisma.domain.findFirst({ where: { id: body.domainId, tenantId } });
      if (!domain) throw errors.notFound('domain_not_found');
      if (!body.source.endsWith(`@${domain.name}`))
        throw errors.badRequest('alias_domain_mismatch', 'Alias source must be on the selected domain');
      for (const dest of body.destinations) {
        if (!EMAIL_RE.test(dest)) throw errors.badRequest('invalid_destination', `Not a valid email: ${dest}`);
      }

      const existing = await prisma.alias.findUnique({ where: { source: body.source } });
      if (existing) throw errors.conflict('alias_taken', 'Alias already exists');

      const alias = await prisma.alias.create({
        data: {
          tenantId,
          domainId: domain.id,
          source: body.source,
          destinationRaw: body.destinations.join(','),
        },
      });
      await prisma.auditEvent.create({
        data: {
          tenantId,
          actorUserId: req.currentUser!.id,
          action: 'alias.created',
          targetType: 'alias',
          targetId: alias.id,
          metadata: { source: alias.source, destinations: body.destinations },
          ipAddress: req.ip,
        },
      });
      reply.code(201);
      return { id: alias.id, source: alias.source };
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const alias = await prisma.alias.findFirst({ where: { id, tenantId: req.currentTenant!.id } });
      if (!alias) throw errors.notFound('alias_not_found');
      await prisma.alias.delete({ where: { id: alias.id } });
      reply.code(204);
    },
  });
};

export default routes;
