import { Worker, Job } from 'bullmq';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { decryptSecret } from '../lib/crypto.js';
import { performSend, type OutgoingMessage } from '../services/mailSend.js';
import { logger } from '../lib/logger.js';

/**
 * Scheduled send worker.
 *
 * Payload is just the ScheduledMessage row id; the actual outgoing content
 * is loaded from Postgres (payloadCipher is AES-256-GCM). If the row was
 * cancelled since the job was queued, we skip silently.
 */

interface SchedulePayload {
  scheduledMessageId: string;
}

export const scheduleWorker = new Worker<SchedulePayload>(
  QUEUE_NAMES.schedule,
  async (job: Job<SchedulePayload>) => {
    const record = await prisma.scheduledMessage.findUnique({
      where: { id: job.data.scheduledMessageId },
    });
    if (!record) return { skipped: 'no_row' };
    if (record.status !== 'pending') return { skipped: record.status };

    const mailbox = await prisma.mailbox.findUnique({ where: { id: record.mailboxId } });
    if (!mailbox || mailbox.status === 'pending_deletion') {
      await prisma.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'failed', errorSummary: 'mailbox_missing_or_deleted' },
      });
      return { skipped: 'mailbox_gone' };
    }

    let outgoing: OutgoingMessage;
    try {
      outgoing = JSON.parse(decryptSecret(record.payloadCipher)) as OutgoingMessage;
    } catch (err) {
      await prisma.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'failed', errorSummary: 'payload_decrypt_failed' },
      });
      logger.error({ err, id: record.id }, 'scheduled_payload_decrypt_failed');
      return { failed: true };
    }

    try {
      await performSend({ ...outgoing, mailboxId: mailbox.id });
      await prisma.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'sent' },
      });
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      await prisma.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'failed', errorSummary: message.slice(0, 400) },
      });
      throw err;
    }
  },
  { connection: bullConnection, concurrency: 4 },
);

scheduleWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'schedule_worker_failed');
});
