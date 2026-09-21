import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ needs `maxRetriesPerRequest: null` on its Redis connections; using
 * the shared client (which has retries) would cause silent job loss.
 */
export const bullConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const QUEUE_NAMES = {
  migration: 'cloudmail-migration',
  export: 'cloudmail-export',
  webhooks: 'cloudmail-webhooks',
  domainVerify: 'cloudmail-domain-verify',
  reminders: 'cloudmail-reminders',
  quota: 'cloudmail-quota',
  schedule: 'cloudmail-schedule',
} as const;

export const migrationQueue = new Queue(QUEUE_NAMES.migration, { connection: bullConnection });
export const exportQueue = new Queue(QUEUE_NAMES.export, { connection: bullConnection });
export const webhookQueue = new Queue(QUEUE_NAMES.webhooks, { connection: bullConnection });
export const domainVerifyQueue = new Queue(QUEUE_NAMES.domainVerify, { connection: bullConnection });
export const reminderQueue = new Queue(QUEUE_NAMES.reminders, { connection: bullConnection });
export const scheduleQueue = new Queue(QUEUE_NAMES.schedule, { connection: bullConnection });

export const migrationEvents = new QueueEvents(QUEUE_NAMES.migration, { connection: bullConnection });
