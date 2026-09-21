import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { shortId } from '../lib/ids.js';

/**
 * API credentials. Secret is displayed ONCE on creation (returned in the
 * response) and never stored in plaintext. From then on we only ever expose
 * the key prefix, so users can identify a key without leaking material.
 */

const SCOPES = [
  'mail.read',
  'mail.send',
  'contacts.read',
  'contacts.write',
  'domains.read',
  'mailboxes.read',
  'mailboxes.manage',
] as const;

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.apiCredential.findMany({
        where: { tenantId: req.currentTenant!.id },
        orderBy: { createdAt: 'desc' },
      });
      return {
        keys: rows.map((r) => ({
          id: r.id,
          name: r.name,
          keyPrefix: r.keyPrefix,
          scopes: r.scopes,
          lastUsedAt: r.lastUsedAt,
          expiresAt: r.expiresAt,
          revokedAt: r.revokedAt,
          createdAt: r.createdAt,
        })),
      };
    },
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(80),
          scopes: z.array(z.enum(SCOPES)).min(1),
        })
        .parse(req.body);

      const raw = `cm_${shortId()}${shortId()}`; // ~44 chars
      const keyPrefix = raw.slice(0, 10);
      const secretHash = await argon2.hash(raw);

      const rec = await prisma.apiCredential.create({
        data: {
          tenantId: req.currentTenant!.id,
          name: body.name,
          keyPrefix,
          secretHash,
          scopes: body.scopes,
        },
      });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'api_key.created',
          targetType: 'api_credential',
          targetId: rec.id,
          metadata: { name: body.name, scopes: body.scopes },
          ipAddress: req.ip,
        },
      });
      reply.code(201);
      return {
        id: rec.id,
        name: rec.name,
        scopes: rec.scopes,
        keyPrefix: rec.keyPrefix,
        secret: raw, // shown once, never again
        createdAt: rec.createdAt,
      };
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const rec = await prisma.apiCredential.findFirst({
        where: { id, tenantId: req.currentTenant!.id },
      });
      if (!rec) throw errors.notFound('api_key_not_found');
      await prisma.apiCredential.update({
        where: { id: rec.id },
        data: { revokedAt: new Date() },
      });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'api_key.revoked',
          targetType: 'api_credential',
          targetId: rec.id,
          ipAddress: req.ip,
        },
      });
      reply.code(204);
    },
  });
};

export default routes;
