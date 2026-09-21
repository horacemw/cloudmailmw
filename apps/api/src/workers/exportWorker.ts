import { Worker, type Job } from 'bullmq';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { openImapAsMailbox } from '../mail/imapClient.js';
import { env } from '../config/env.js';
import { notifyTenantAdmins } from '../services/notify.js';
import { logger } from '../lib/logger.js';

interface ExportPayload {
  jobId: string;
}

const EXPORT_DIR = path.resolve(env.UPLOAD_TMP_DIR, 'exports');

export const exportWorker = new Worker<ExportPayload>(
  QUEUE_NAMES.export,
  async (job: Job<ExportPayload>) => {
    const record = await prisma.exportJob.findUnique({ where: { id: job.data.jobId } });
    if (!record) return { skipped: 'no_job' };

    const mailbox = await prisma.mailbox.findUnique({ where: { id: record.mailboxId } });
    if (!mailbox) throw new Error('mailbox_missing');

    await fs.mkdir(EXPORT_DIR, { recursive: true });
    const outFile = path.join(EXPORT_DIR, `${record.id}.mbox`);
    const client = await openImapAsMailbox({ mailboxAddress: mailbox.address, readOnly: true });

    try {
      await prisma.exportJob.update({
        where: { id: record.id },
        data: { status: 'running' },
      });

      const folders =
        record.scope === 'folder' && record.scopeFolder
          ? [{ path: record.scopeFolder }]
          : await client.list();

      const out = await fs.open(outFile, 'w');
      let processed = 0;

      try {
        for (const folder of folders) {
          try {
            await client.mailboxOpen(folder.path, { readOnly: true });
          } catch {
            continue;
          }
          const uidsRaw = await client.search({ all: true }, { uid: true });
          const uids = Array.isArray(uidsRaw) ? uidsRaw : [];
          for (const uid of uids) {
            const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
            if (!msg || !msg.source) continue;
            // MBOX "From " separator
            const line = `From cloudmail-export@localhost ${new Date().toUTCString()}\r\n`;
            await out.write(line);
            await pipelineBufferToFile(msg.source, out);
            await out.write('\r\n');
            processed++;
            if (processed % 50 === 0) {
              await prisma.exportJob.update({
                where: { id: record.id },
                data: { processed },
              });
              await job.updateProgress(processed);
            }
          }
        }
      } finally {
        await out.close();
      }

      // In prod, this would upload to object storage + return signed URL.
      // For now, expose via /v1/exports/:id/download (see routes/exports.ts).
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.exportJob.update({
        where: { id: record.id },
        data: {
          status: 'completed',
          processed,
          downloadUrl: `/v1/exports/${record.id}/download`,
          expiresAt,
        },
      });
      await notifyTenantAdmins({
        tenantId: record.tenantId,
        kind: 'export_completed',
        title: `Export ready for ${mailbox.address}`,
        body: `${processed.toLocaleString()} messages · download expires ${expiresAt.toISOString().slice(0, 10)}.`,
        targetType: 'export',
        targetId: record.id,
      });
      return { processed };
    } catch (err) {
      logger.error({ err, jobId: record.id }, 'export_worker_failed');
      await prisma.exportJob.update({
        where: { id: record.id },
        data: { status: 'failed' },
      });
      throw err;
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  },
  { connection: bullConnection, concurrency: 2 },
);

async function pipelineBufferToFile(buf: Buffer, file: fs.FileHandle): Promise<void> {
  const { Readable } = await import('node:stream');
  await pipeline(Readable.from(buf), file.createWriteStream({ autoClose: false }));
}
