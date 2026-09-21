import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

/**
 * Per-user contact book. Every contact carries `ownerUserId` AND `tenantId`
 * so a user leaving an org cannot orphan the record into another tenant's
 * view. Autocomplete on /search returns 12 results max, sorted by starred +
 * lexical name — fast enough to hit on every keystroke.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const q = z
        .object({
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
          cursor: z.string().optional(),
        })
        .parse(req.query);
      const rows = await prisma.contact.findMany({
        where: {
          ownerUserId: req.currentUser!.id,
          tenantId: req.currentTenant!.id,
          ...(q.search
            ? {
                OR: [
                  { displayName: { contains: q.search, mode: 'insensitive' } },
                  { email: { contains: q.search, mode: 'insensitive' } },
                  { firstName: { contains: q.search, mode: 'insensitive' } },
                  { lastName: { contains: q.search, mode: 'insensitive' } },
                  { company: { contains: q.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: [{ starred: 'desc' }, { displayName: 'asc' }],
      });
      const nextCursor = rows.length > q.limit ? rows.pop()!.id : null;
      return {
        contacts: rows.map(strip),
        nextCursor,
      };
    },
  });

  /** Optimised for composer autocomplete — small, fast, no cursor. */
  fastify.get('/search', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const q = z.object({ q: z.string().min(1).max(80) }).parse(req.query);
      const rows = await prisma.contact.findMany({
        where: {
          ownerUserId: req.currentUser!.id,
          tenantId: req.currentTenant!.id,
          OR: [
            { displayName: { contains: q.q, mode: 'insensitive' } },
            { email: { startsWith: q.q, mode: 'insensitive' } },
          ],
        },
        take: 12,
        orderBy: [{ starred: 'desc' }, { displayName: 'asc' }],
        select: { id: true, displayName: true, email: true },
      });
      return { results: rows.map((r) => ({ id: r.id, name: r.displayName, email: r.email })) };
    },
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = contactSchema.parse(req.body);
      body.email = body.email.trim().toLowerCase();
      if (!EMAIL.test(body.email)) throw errors.badRequest('invalid_email', 'Not a valid email address');

      const dup = await prisma.contact.findFirst({
        where: { ownerUserId: req.currentUser!.id, email: body.email },
      });
      if (dup) throw errors.conflict('contact_exists', 'You already have a contact with this email');

      const displayName = displayNameOf(body);
      const c = await prisma.contact.create({
        data: {
          tenantId: req.currentTenant!.id,
          ownerUserId: req.currentUser!.id,
          firstName: body.firstName ?? null,
          lastName: body.lastName ?? null,
          displayName,
          email: body.email,
          phone: body.phone ?? null,
          company: body.company ?? null,
          jobTitle: body.jobTitle ?? null,
          notes: body.notes ?? null,
          groups: body.groups ?? [],
          starred: body.starred ?? false,
        },
      });
      reply.code(201);
      return strip(c);
    },
  });

  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = contactSchema.partial().parse(req.body);
      const existing = await prisma.contact.findFirst({
        where: { id, ownerUserId: req.currentUser!.id, tenantId: req.currentTenant!.id },
      });
      if (!existing) throw errors.notFound('contact_not_found');
      const merged = { ...existing, ...body };
      const patched = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          firstName: body.firstName ?? existing.firstName,
          lastName: body.lastName ?? existing.lastName,
          displayName: displayNameOf({
            ...merged,
            firstName: merged.firstName ?? undefined,
            lastName: merged.lastName ?? undefined,
            email: merged.email,
          }),
          email: body.email ? body.email.trim().toLowerCase() : existing.email,
          phone: body.phone ?? existing.phone,
          company: body.company ?? existing.company,
          jobTitle: body.jobTitle ?? existing.jobTitle,
          notes: body.notes ?? existing.notes,
          groups: body.groups ?? existing.groups,
          starred: body.starred ?? existing.starred,
        },
      });
      return strip(patched);
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const existing = await prisma.contact.findFirst({
        where: { id, ownerUserId: req.currentUser!.id, tenantId: req.currentTenant!.id },
      });
      if (!existing) throw errors.notFound('contact_not_found');
      await prisma.contact.delete({ where: { id: existing.id } });
      reply.code(204);
    },
  });
};

const contactSchema = z.object({
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  email: z.string().max(255),
  phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  jobTitle: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  groups: z.array(z.string().max(40)).max(20).optional(),
  starred: z.boolean().optional(),
});

function displayNameOf(c: { firstName?: string; lastName?: string; email: string }): string {
  const combined = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return combined || c.email;
}

interface ContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  notes: string | null;
  groups: string[];
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}
function strip(c: ContactRow) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    displayName: c.displayName,
    email: c.email,
    phone: c.phone,
    company: c.company,
    jobTitle: c.jobTitle,
    notes: c.notes,
    groups: c.groups,
    starred: c.starred,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default routes;
