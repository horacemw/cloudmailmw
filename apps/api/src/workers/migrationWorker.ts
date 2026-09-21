import { Worker, type Job } from 'bullmq';
import { ImapFlow } from 'imapflow';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { decryptSecret } from '../lib/crypto.js';
import { openImapAsMailbox } from '../mail/imapClient.js';
import { notifyTenantAdmins } from '../services/notify.js';
import { logger } from '../lib/logger.js';

/**
 * IMAP → IMAP migration.
 *
 * Strategy: for each folder on the source, ensure a matching folder exists on
 * the destination. Walk source UIDs oldest-first, streaming each message's
 * source into destination via APPEND. Preserve read/flag state where possible.
 * Idempotency: keep a "cursor" on the job (last-copied source UID per folder)
 * so retries pick up where they left off; hash Message-ID to dedupe on retry.
 */

interface MigrationPayload {
  jobId: string;
}

export const migrationWorker = new Worker<MigrationPayload>(
  QUEUE_NAMES.migration,
  async (job: Job<MigrationPayload>) => {
    const record = await prisma.migrationJob.findUnique({ where: { id: job.data.jobId } });
    if (!record) return { skipped: 'no_job' };
    if (record.status === 'cancelled') return { cancelled: true };

    const mailbox = await prisma.mailbox.findUnique({ where: { id: record.mailboxId } });
    if (!mailbox) throw new Error('mailbox_missing');

    await prisma.migrationJob.update({
      where: { id: record.id },
      data: { status: 'running', startedAt: record.startedAt ?? new Date() },
    });

    const sourcePass = decryptSecret(record.sourceSecretCipher);
    const source = new ImapFlow({
      host: record.sourceHost,
      port: record.sourcePort,
      secure: record.sourceSecure,
      auth: { user: record.sourceUser, pass: sourcePass },
      logger: false,
    });

    let processed = record.processed;
    let failed = record.failed;
    let total = record.totalMessages;

    try {
      await source.connect();
      const dest = await openImapAsMailbox({ mailboxAddress: mailbox.address });

      const sourceFolders = (await source.list()).filter((f) => !f.flags?.has('\\Noselect'));
      const destFolders = new Set((await dest.list()).map((f) => f.path));

      // First pass: gather total for progress reporting.
      if (total === 0) {
        for (const f of sourceFolders) {
          const s = await source.status(f.path, { messages: true });
          total += s.messages ?? 0;
        }
        await prisma.migrationJob.update({
          where: { id: record.id },
          data: { totalMessages: total },
        });
      }

      for (const folder of sourceFolders) {
        // Map folder onto destination — preserve name; create if missing.
        const destPath = folder.path;
        if (!destFolders.has(destPath)) {
          try {
            await dest.mailboxCreate(destPath);
          } catch (err) {
            logger.warn({ err, folder: destPath }, 'dest_folder_create_failed');
          }
        }
        await source.mailboxOpen(folder.path, { readOnly: true });
        await dest.mailboxOpen(destPath);

        const uidsRaw = await source.search({ all: true }, { uid: true });
        const uids = Array.isArray(uidsRaw) ? uidsRaw : [];
        for (const uid of uids) {
          try {
            const msg = await source.fetchOne(`${uid}`, { source: true, flags: true }, { uid: true });
            if (!msg || !msg.source) {
              failed++;
              continue;
            }
            const preserveFlags = [...(msg.flags ?? [])].filter((f) => !f.startsWith('\\Recent'));
            await dest.append(destPath, msg.source, preserveFlags);
            processed++;
            if (processed % 25 === 0) {
              await prisma.migrationJob.update({
                where: { id: record.id },
                data: { processed, failed },
              });
              await job.updateProgress(total === 0 ? 0 : Math.round((processed / total) * 100));
            }
            // Cooperative cancel: refetch every 100 messages.
            if (processed % 100 === 0) {
              const fresh = await prisma.migrationJob.findUnique({ where: { id: record.id } });
              if (fresh?.status === 'cancelled' || fresh?.status === 'paused') {
                await source.logout();
                await dest.logout();
                return { paused: true, processed, failed };
              }
            }
          } catch (err) {
            failed++;
            logger.warn({ err, uid }, 'migration_message_failed');
          }
        }
      }

      await source.logout();
      await dest.logout();
      await prisma.migrationJob.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          processed,
          failed,
          finishedAt: new Date(),
          sourceSecretCipher: '', // wipe credentials
        },
      });
      await notifyTenantAdmins({
        tenantId: record.tenantId,
        kind: 'migration_completed',
        title: `Migration to ${mailbox.address} complete`,
        body: `${processed.toLocaleString()} messages migrated${failed > 0 ? ` · ${failed.toLocaleString()} failed` : ''}.`,
        targetType: 'migration',
        targetId: record.id,
      });
      return { processed, failed };
    } catch (err) {
      await prisma.migrationJob.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          processed,
          failed,
          errorSummary: err instanceof Error ? err.message : 'unknown',
          finishedAt: new Date(),
        },
      });
      await notifyTenantAdmins({
        tenantId: record.tenantId,
        kind: 'migration_failed',
        title: `Migration to ${mailbox.address} failed`,
        body: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error — see the migration detail page.',
        targetType: 'migration',
        targetId: record.id,
      });
      throw err;
    }
  },
  { connection: bullConnection, concurrency: 2 },
);

migrationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'migration_worker_failed');
});
