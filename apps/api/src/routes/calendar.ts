import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { expandEvents, toIcs } from '../services/recurrence.js';
import { parseIcs } from '../services/icsParse.js';
import type { EventStatus, RsvpStatus } from '@prisma/client';

/**
 * Calendars + events API.
 *
 *   GET/POST /v1/calendars
 *   PATCH/DELETE /v1/calendars/:id
 *   GET /v1/calendars/:id/ics                    — download as .ics
 *
 *   GET  /v1/events?from=&to=&calendarId?        — expanded occurrences in range
 *   POST /v1/events                              — create (supports rrule + attendees)
 *   GET  /v1/events/:id
 *   PATCH /v1/events/:id                         — supports { scope: 'occurrence' | 'series' }
 *   DELETE /v1/events/:id                        — same scope semantics
 *
 *   POST /v1/events/:id/rsvp                     — { email, status } — attendee response
 *
 * Everything is tenant + owner scoped.
 */

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── Calendars ─────────────────────────────────────────────── */

  fastify.get('/calendars', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.calendar.findMany({
        where: { ownerUserId: req.currentUser!.id, tenantId: req.currentTenant!.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      // Ensure the user always has at least one calendar (auto-create "Personal").
      if (rows.length === 0) {
        const cal = await prisma.calendar.create({
          data: {
            tenantId: req.currentTenant!.id,
            ownerUserId: req.currentUser!.id,
            name: 'Personal',
            color: '#159447',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            isDefault: true,
          },
        });
        return { calendars: [strip(cal)] };
      }
      return { calendars: rows.map(strip) };
    },
  });

  fastify.post('/calendars', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(80),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#159447'),
          timezone: z.string().max(80).default('UTC'),
          isDefault: z.boolean().optional(),
        })
        .parse(req.body);
      if (body.isDefault) {
        await prisma.calendar.updateMany({
          where: { ownerUserId: req.currentUser!.id },
          data: { isDefault: false },
        });
      }
      const c = await prisma.calendar.create({
        data: {
          tenantId: req.currentTenant!.id,
          ownerUserId: req.currentUser!.id,
          name: body.name,
          color: body.color,
          timezone: body.timezone,
          isDefault: Boolean(body.isDefault),
        },
      });
      reply.code(201);
      return strip(c);
    },
  });

  fastify.patch('/calendars/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(80).optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          timezone: z.string().max(80).optional(),
          visible: z.boolean().optional(),
          isDefault: z.boolean().optional(),
        })
        .parse(req.body);
      const existing = await ownCalendar(req.currentUser!.id, req.currentTenant!.id, id);
      if (body.isDefault) {
        await prisma.calendar.updateMany({
          where: { ownerUserId: req.currentUser!.id },
          data: { isDefault: false },
        });
      }
      const u = await prisma.calendar.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? existing.name,
          color: body.color ?? existing.color,
          timezone: body.timezone ?? existing.timezone,
          visible: body.visible ?? existing.visible,
          isDefault: body.isDefault ?? existing.isDefault,
        },
      });
      return strip(u);
    },
  });

  fastify.delete('/calendars/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const existing = await ownCalendar(req.currentUser!.id, req.currentTenant!.id, id);
      const count = await prisma.calendar.count({ where: { ownerUserId: req.currentUser!.id } });
      if (count <= 1) throw errors.badRequest('cannot_delete_last_calendar', 'You must keep at least one calendar');
      await prisma.calendar.delete({ where: { id: existing.id } });
      reply.code(204);
    },
  });

  fastify.post('/calendars/:id/import', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const cal = await ownCalendar(req.currentUser!.id, req.currentTenant!.id, id);

      // Accept either raw text/calendar (default) or a multipart upload
      // with a field named "file".
      let body: string | null = null;
      const ct = (req.headers['content-type'] ?? '').toLowerCase();
      if (ct.startsWith('multipart/')) {
        const file = await req.file();
        if (!file) throw errors.badRequest('no_file', 'Upload a file field named "file"');
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of file.file) {
          total += chunk.length;
          if (total > 5 * 1024 * 1024)
            throw errors.badRequest('too_large', 'ICS file exceeds 5 MB');
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString('utf8');
      } else if (typeof req.body === 'string') {
        body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        body = (req.body as Buffer).toString('utf8');
      }
      if (!body) throw errors.badRequest('no_body', 'Provide the .ics file as body or multipart file');
      if (body.length > 5 * 1024 * 1024)
        throw errors.badRequest('too_large', 'ICS file exceeds 5 MB');

      const parsed = parseIcs(body);
      if (parsed.length === 0) return { imported: 0, skipped: 0 };

      let imported = 0;
      let skipped = 0;
      for (const ev of parsed) {
        // Dedup by (calendarId, uid) — re-importing the same file is a no-op.
        if (ev.uid) {
          const exists = await prisma.calendarEvent.findFirst({
            where: { calendarId: cal.id, description: { contains: `IMPORT_UID:${ev.uid}` } },
          });
          if (exists) {
            skipped++;
            continue;
          }
        }
        try {
          const created = await prisma.calendarEvent.create({
            data: {
              tenantId: cal.tenantId,
              calendarId: cal.id,
              title: ev.summary.slice(0, 500) || '(untitled)',
              // Persist the source UID as a marker in the description so re-imports
              // are idempotent without needing an extra DB column.
              description: [ev.description ?? null, ev.uid ? `\n<!--IMPORT_UID:${ev.uid}-->` : null]
                .filter(Boolean)
                .join('') || null,
              location: ev.location?.slice(0, 200) ?? null,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
              timezone: ev.timezone,
              allDay: ev.allDay,
              organizerEmail: ev.organizerEmail?.slice(0, 200) ?? null,
              status: ev.status as EventStatus,
              rrule: ev.rrule,
              attendees: ev.attendees.length
                ? {
                    create: ev.attendees.slice(0, 100).map((a) => ({
                      email: a.email.slice(0, 200),
                      displayName: a.displayName?.slice(0, 200) ?? null,
                      rsvpStatus: a.rsvp as RsvpStatus,
                    })),
                  }
                : undefined,
            },
          });
          imported++;
          void created;
        } catch {
          skipped++;
        }
      }
      reply.code(201);
      return { imported, skipped };
    },
  });

  fastify.get('/calendars/:id/ics', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const cal = await ownCalendar(req.currentUser!.id, req.currentTenant!.id, id);
      const events = await prisma.calendarEvent.findMany({
        where: { calendarId: cal.id },
        include: { attendees: true },
      });
      const ics = toIcs(cal.name, events);
      reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', `attachment; filename="${cal.name.replace(/[^a-z0-9]+/gi, '-')}.ics"`);
      return ics;
    },
  });

  /* ─── Events ────────────────────────────────────────────────── */

  fastify.get('/events', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const q = z
        .object({
          from: z.string().datetime(),
          to: z.string().datetime(),
          calendarId: z.string().optional(),
        })
        .parse(req.query);
      const windowStart = new Date(q.from);
      const windowEnd = new Date(q.to);
      // Cap window to ~1 year so infinitely-recurring events can't blow up.
      const maxWindow = 400 * 24 * 60 * 60 * 1000;
      if (windowEnd.getTime() - windowStart.getTime() > maxWindow)
        throw errors.badRequest('window_too_large', 'Request at most 400 days at once');

      // Fetch tenant+owner-scoped events that either overlap the window
      // OR have an RRULE (which we'll expand in memory).
      const events = await prisma.calendarEvent.findMany({
        where: {
          tenantId: req.currentTenant!.id,
          calendar: { ownerUserId: req.currentUser!.id },
          ...(q.calendarId ? { calendarId: q.calendarId } : {}),
          OR: [
            { rrule: { not: null } },
            {
              AND: [
                { startsAt: { lte: windowEnd } },
                { endsAt: { gte: windowStart } },
              ],
            },
            { masterId: { not: null } },   // include overrides so expander can consume them
          ],
        },
        include: { attendees: true, overrides: true },
        orderBy: { startsAt: 'asc' },
      });

      const expanded = expandEvents(events, windowStart, windowEnd);
      return { events: expanded };
    },
  });

  fastify.post('/events', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = eventBodySchema.parse(req.body);
      // Verify the calendar belongs to the current user.
      const cal = await ownCalendar(req.currentUser!.id, req.currentTenant!.id, body.calendarId);
      const created = await prisma.calendarEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          calendarId: cal.id,
          title: body.title,
          description: body.description ?? null,
          location: body.location ?? null,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          timezone: body.timezone,
          allDay: body.allDay,
          organizerEmail: body.organizerEmail ?? req.currentUser!.email,
          status: (body.status ?? 'confirmed') as EventStatus,
          rrule: body.rrule ?? null,
          reminderMinutes: body.reminderMinutes ?? null,
          attendees: body.attendees && body.attendees.length
            ? {
                create: body.attendees.map((a, i) => ({
                  email: a.email.toLowerCase(),
                  displayName: a.displayName ?? null,
                  isOrganizer: i === 0 && !!body.organizerEmail && a.email.toLowerCase() === body.organizerEmail?.toLowerCase(),
                })),
              }
            : undefined,
        },
        include: { attendees: true },
      });
      reply.code(201);
      return { id: created.id };
    },
  });

  fastify.get('/events/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const ev = await loadOwnEvent(req.currentUser!.id, req.currentTenant!.id, id);
      return {
        ...ev,
        attendees: ev.attendees,
      };
    },
  });

  fastify.patch('/events/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = eventBodySchema.partial().extend({
        scope: z.enum(['occurrence', 'series']).default('series'),
        occurrenceDate: z.string().datetime().optional(),
      }).parse(req.body);
      const ev = await loadOwnEvent(req.currentUser!.id, req.currentTenant!.id, id);

      // Editing a single occurrence of a recurring series: create/update an
      // override row keyed on the original occurrence date.
      if (body.scope === 'occurrence' && ev.rrule && body.occurrenceDate) {
        const occDate = new Date(body.occurrenceDate);
        const existing = await prisma.calendarEvent.findFirst({
          where: {
            masterId: ev.id,
            recurrenceOverrideDate: occDate,
          },
        });
        const data = {
          tenantId: ev.tenantId,
          calendarId: ev.calendarId,
          masterId: ev.id,
          recurrenceOverrideDate: occDate,
          title: body.title ?? ev.title,
          description: body.description ?? ev.description,
          location: body.location ?? ev.location,
          startsAt: body.startsAt ? new Date(body.startsAt) : occDate,
          endsAt: body.endsAt ? new Date(body.endsAt) : new Date(occDate.getTime() + (ev.endsAt.getTime() - ev.startsAt.getTime())),
          timezone: body.timezone ?? ev.timezone,
          allDay: body.allDay ?? ev.allDay,
          status: (body.status as EventStatus | undefined) ?? ev.status,
          reminderMinutes: body.reminderMinutes ?? ev.reminderMinutes,
        };
        if (existing) {
          await prisma.calendarEvent.update({ where: { id: existing.id }, data });
        } else {
          await prisma.calendarEvent.create({ data });
        }
        return { ok: true, scope: 'occurrence' };
      }

      // Series edit (default) — mutate the master row itself.
      await prisma.calendarEvent.update({
        where: { id: ev.id },
        data: {
          title: body.title ?? ev.title,
          description: body.description ?? ev.description,
          location: body.location ?? ev.location,
          startsAt: body.startsAt ? new Date(body.startsAt) : ev.startsAt,
          endsAt: body.endsAt ? new Date(body.endsAt) : ev.endsAt,
          timezone: body.timezone ?? ev.timezone,
          allDay: body.allDay ?? ev.allDay,
          status: (body.status as EventStatus | undefined) ?? ev.status,
          rrule: body.rrule !== undefined ? body.rrule : ev.rrule,
          reminderMinutes: body.reminderMinutes ?? ev.reminderMinutes,
        },
      });
      return { ok: true, scope: 'series' };
    },
  });

  fastify.delete('/events/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const q = z.object({
        scope: z.enum(['occurrence', 'series']).default('series'),
        occurrenceDate: z.string().datetime().optional(),
      }).parse(req.query);
      const ev = await loadOwnEvent(req.currentUser!.id, req.currentTenant!.id, id);

      if (q.scope === 'occurrence' && ev.rrule && q.occurrenceDate) {
        const occDate = new Date(q.occurrenceDate);
        await prisma.calendarEvent.upsert({
          where: {
            id: (await prisma.calendarEvent.findFirst({
              where: { masterId: ev.id, recurrenceOverrideDate: occDate },
              select: { id: true },
            }))?.id ?? 'x-not-exists',
          },
          create: {
            tenantId: ev.tenantId,
            calendarId: ev.calendarId,
            title: ev.title,
            startsAt: occDate,
            endsAt: occDate,
            timezone: ev.timezone,
            masterId: ev.id,
            recurrenceOverrideDate: occDate,
            status: 'cancelled',
          },
          update: { status: 'cancelled' },
        });
        reply.code(204);
        return;
      }

      await prisma.calendarEvent.delete({ where: { id: ev.id } });
      reply.code(204);
    },
  });

  fastify.post('/events/:id/rsvp', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z.object({
        email: z.string().email(),
        status: z.enum(['accepted', 'declined', 'tentative', 'needs_action']),
      }).parse(req.body);
      const ev = await loadOwnEvent(req.currentUser!.id, req.currentTenant!.id, id);
      const email = body.email.toLowerCase();
      const existing = ev.attendees.find((a) => a.email === email);
      if (!existing) throw errors.notFound('attendee_not_on_event');
      const updated = await prisma.eventAttendee.update({
        where: { id: existing.id },
        data: {
          rsvpStatus: body.status as RsvpStatus,
          respondedAt: new Date(),
        },
      });
      return updated;
    },
  });
};

const eventBodySchema = z.object({
  calendarId: z.string(),
  title: z.string().min(1).max(240),
  description: z.string().max(20_000).optional(),
  location: z.string().max(240).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().max(80).default('UTC'),
  allDay: z.boolean().default(false),
  organizerEmail: z.string().email().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  rrule: z.string().max(500).nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(43200).nullable().optional(), // ≤ 30 days
  attendees: z.array(z.object({
    email: z.string().email(),
    displayName: z.string().max(120).optional(),
  })).max(50).optional(),
});

async function ownCalendar(userId: string, tenantId: string, id: string) {
  const c = await prisma.calendar.findFirst({
    where: { id, ownerUserId: userId, tenantId },
  });
  if (!c) throw errors.notFound('calendar_not_found');
  return c;
}

async function loadOwnEvent(userId: string, tenantId: string, id: string) {
  const e = await prisma.calendarEvent.findFirst({
    where: { id, tenantId, calendar: { ownerUserId: userId } },
    include: { attendees: true },
  });
  if (!e) throw errors.notFound('event_not_found');
  return e;
}

function strip(c: { id: string; name: string; color: string; timezone: string; isDefault: boolean; visible: boolean; createdAt: Date }) {
  return {
    id: c.id, name: c.name, color: c.color, timezone: c.timezone,
    isDefault: c.isDefault, visible: c.visible, createdAt: c.createdAt,
  };
}

export default routes;
