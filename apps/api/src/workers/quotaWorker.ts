import { Worker, Job, Queue } from 'bullmq';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { syncAllMailboxes } from '../services/quotaSync.js';
import { logger } from '../lib/logger.js';

/**
 * Quota sweep. A single tick job re-enqueues itself so the loop survives a
 * Redis flush after seeding once at boot. Interval is intentionally long
 * (15 min) because doveadm spawns are not free and mailbox usage doesn't
 * change dramatically over shorter windows.
 */

// Fixed jobId only for the SEED so a boot-storm doesn't insert dozens of ticks.
// Re-enqueues use a timestamped id — otherwise BullMQ rejects the re-enqueue as
// a duplicate before the just-finished job is removed, and the loop dies.
const QUOTA_SEED_JOB_ID = 'quota-tick-seed';
const QUOTA_TICK_INTERVAL_MS = 15 * 60_000;

interface QuotaTickPayload {
  kind: 'tick';
}

const quotaQueue = new Queue<QuotaTickPayload>(QUEUE_NAMES.quota, {
  connection: bullConnection,
});

async function enqueueNextQuotaTick(delayMs: number): Promise<void> {
  await quotaQueue.add(
    'tick',
    { kind: 'tick' },
    {
      jobId: `quota-tick-${Date.now()}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

export const quotaWorker = new Worker<QuotaTickPayload>(
  QUEUE_NAMES.quota,
  async (job: Job<QuotaTickPayload>) => {
    if (job.data.kind !== 'tick') return;
    try {
      const result = await syncAllMailboxes();
      logger.debug({ scanned: result.scanned }, 'quota_sweep_done');
    } catch (err) {
      logger.warn({ err }, 'quota_sweep_failed');
    }
    await enqueueNextQuotaTick(QUOTA_TICK_INTERVAL_MS);
  },
  { connection: bullConnection, concurrency: 1 },
);

quotaWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'quota_worker_failed');
});

export async function ensureQuotaTickSeeded(): Promise<void> {
  // The seed uses a fixed id so re-boots don't stack ticks. If a periodic tick
  // is already queued (from a previous boot), BullMQ will simply reject this
  // add as a duplicate — that's the desired behaviour.
  await quotaQueue.add(
    'tick',
    { kind: 'tick' },
    {
      jobId: QUOTA_SEED_JOB_ID,
      delay: 30_000,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
