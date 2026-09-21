import { Worker, Job } from 'bullmq';
import { bullConnection, QUEUE_NAMES, reminderQueue } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { expandEvents } from '../services/recurrence.js';
import { notify } from '../services/notify.js';
import { logger } from '../lib/logger.js';

/**
 * Calendar reminder worker.
 *
 * Strategy: the scheduler tick runs every minute (a delayed "tick" job that
 * re-enqueues itself). On each tick we look at every event with a
 * reminderMinutes value whose next occurrence's reminder falls in the next
 * ~2 minutes, and materialise a per-user notification for the calendar's
 * owner. Idempotency: we track already-fired reminders in a small Redis
 * set keyed by (eventId + occurrenceISO) with a 24 h TTL.
 */

// See quotaWorker.ts for why the seed uses a fixed id but re-enqueues don't:
// a fixed jobId collides with the just-completed job before it's removed, so
// the loop dies after one tick.
const TICK_SEED_JOB_ID = 'reminders-tick-seed';
const TICK_INTERVAL_MS = 60_000;
const LOOKAHEAD_MS = 2 * 60_000; // fire jobs whose reminder falls in the next 2 min

interface TickPayload {
  kind: 'tick';
}

async function alreadyFired(eventId: string, occurrenceIso: string): Promise<boolean> {
  const key = `cm:reminder:${eventId}:${occurrenceIso}`;
  const set = await bullConnection.set(key, '1', 'EX', 24 * 60 * 60, 'NX');
  return set === null;
}

async function tick(): Promise<void> {
  const now = Date.now();
  const windowEnd = new Date(now + LOOKAHEAD_MS + 24 * 60 * 60 * 1000); // recurrence window ~24h out
  // Only load events that HAVE a reminder — no point expanding otherwise.
  const events = await prisma.calendarEvent.findMany({
    where: {
      reminderMinutes: { not: null },
      masterId: null,
      // Endless recurring events have no natural end; keep them.
      OR: [{ endsAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } }, { rrule: { not: null } }],
    },
    include: { calendar: { select: { ownerUserId: true, tenantId: true } } },
  });
  if (!events.length) return;

  const overridesByMaster = new Map<string, unknown[]>(); // schema type not needed here
  const overrides = await prisma.calendarEvent.findMany({
    where: { masterId: { in: events.map((e) => e.id) } },
  });
  for (const ov of overrides) {
    if (!ov.masterId) continue;
    const arr = overridesByMaster.get(ov.masterId) ?? [];
    arr.push(ov);
    overridesByMaster.set(ov.masterId, arr);
  }

  for (const ev of events) {
    if (ev.reminderMinutes == null) continue;
    const expanded = expandEvents(
      [{ ...ev, attendees: [], overrides: (overridesByMaster.get(ev.id) as any[]) ?? [] } as any],
      new Date(now),
      windowEnd,
    );
    for (const occ of expanded) {
      const remindAt = occ.startsAt.getTime() - ev.reminderMinutes * 60_000;
      if (remindAt < now - 60_000) continue; // already passed by >1 min
      if (remindAt > now + LOOKAHEAD_MS) continue; // not yet due
      const isoKey = occ.startsAt.toISOString();
      if (await alreadyFired(ev.id, isoKey)) continue;
      const startLabel = occ.startsAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      await notify({
        userId: ev.calendar.ownerUserId,
        tenantId: ev.calendar.tenantId,
        kind: 'calendar_reminder',
        title: ev.title,
        body: `Starts ${startLabel}${ev.location ? ` · ${ev.location}` : ''}`,
        targetType: 'event',
        targetId: ev.id,
      });
    }
  }
}

export const reminderWorker = new Worker<TickPayload>(
  QUEUE_NAMES.reminders,
  async (job: Job<TickPayload>) => {
    if (job.data.kind !== 'tick') return;
    try {
      await tick();
    } catch (err) {
      logger.warn({ err }, 'reminder_tick_failed');
    }
    // Re-enqueue the next tick with a unique jobId so BullMQ doesn't reject
    // the add as a duplicate against the just-completing job.
    await reminderQueue.add(
      'tick',
      { kind: 'tick' },
      {
        jobId: `reminders-tick-${Date.now()}`,
        delay: TICK_INTERVAL_MS,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  },
  { connection: bullConnection, concurrency: 1 },
);

reminderWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'reminder_worker_failed');
});

/**
 * Ensure a seed tick exists exactly once. Called from workers/index at boot.
 * The seed's fixed jobId means re-boots don't stack ticks; subsequent
 * self-re-enqueues from inside the worker use timestamped ids.
 */
export async function ensureReminderTickSeeded(): Promise<void> {
  await reminderQueue.add(
    'tick',
    { kind: 'tick' },
    {
      jobId: TICK_SEED_JOB_ID,
      delay: TICK_INTERVAL_MS,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
