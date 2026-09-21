/**
 * Worker process entry point.
 * Run with: `npm run worker`
 * Deploys to the server as a systemd unit; separate process from the HTTP API.
 */
import { logger } from '../lib/logger.js';
import { migrationWorker } from './migrationWorker.js';
import { exportWorker } from './exportWorker.js';
import { webhookWorker } from './webhookWorker.js';
import { reminderWorker, ensureReminderTickSeeded } from './reminderWorker.js';
import { quotaWorker, ensureQuotaTickSeeded } from './quotaWorker.js';
import { scheduleWorker } from './scheduleWorker.js';

logger.info('cloudmail worker starting');
const workers = [migrationWorker, exportWorker, webhookWorker, reminderWorker, quotaWorker, scheduleWorker];

// Seed recurring tick jobs so a single boot brings the loops back even if
// Redis was flushed. Both are jobId-idempotent so re-seeding is safe.
ensureReminderTickSeeded().catch((err) => logger.warn({ err }, 'reminder_seed_failed'));
ensureQuotaTickSeeded().catch((err) => logger.warn({ err }, 'quota_seed_failed'));

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down workers');
  await Promise.allSettled(workers.map((w) => w.close()));
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
