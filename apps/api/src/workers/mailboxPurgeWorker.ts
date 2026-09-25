import { Worker, Job, Queue } from 'bullmq';
import { spawn } from 'node:child_process';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Mailbox purge sweep. Every hour: find mailboxes that have been sitting in
 * status='pending_deletion' longer than MAILBOX_PURGE_RETENTION_DAYS and
 * complete the deletion end-to-end:
 *
 *   1. rm -rf /var/vmail/<domain>/<localpart>  (via sudo helper)
 *   2. delete the Mailbox row (Prisma cascade removes folders/migrations/
 *      exports/aliases with `onDelete: Cascade` in schema.prisma)
 *   3. delete the owner-User row IF that User has no other TenantMember
 *      rows (deleting a User with memberships elsewhere would kick them out
 *      of a different tenant they're still an admin of — never do that)
 *   4. write an audit event `mailbox.purged` scoped to the mailbox's tenant
 *
 * Each mailbox is processed in its own try/catch so a single failure does
 * not abort the sweep. Failures log a warn but the queue does not retry —
 * next tick will pick it up again.
 */

const PURGE_SEED_JOB_ID = 'mailbox-purge-seed';
const PURGE_TICK_INTERVAL_MS = 60 * 60_000; // 1 hour
const PURGE_HELPER = '/usr/local/bin/cloudmail-purge-maildir';

interface PurgeTickPayload {
  kind: 'tick';
}

const purgeQueue = new Queue<PurgeTickPayload>(QUEUE_NAMES.mailboxPurge, {
  connection: bullConnection,
});

async function enqueueNextPurgeTick(delayMs: number): Promise<void> {
  await purgeQueue.add(
    'tick',
    { kind: 'tick' },
    {
      // Timestamped jobId — a fixed id would collide with the just-finished
      // job before BullMQ removes it and the loop would die.
      jobId: `mailbox-purge-${Date.now()}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

/** Split "info@njingatracker.online" -> { localPart, domain }. */
function splitAddress(address: string): { localPart: string; domain: string } | null {
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return null;
  return { localPart: address.slice(0, at), domain: address.slice(at + 1) };
}

function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += String(d)));
    p.stderr.on('data', (d) => (stderr += String(d)));
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `exit ${code}`));
    });
    p.on('error', reject);
  });
}

interface PurgeResult {
  scanned: number;
  purged: number;
  usersDeleted: number;
  skipped: number;
  errors: number;
}

export async function sweepPurgeableMailboxes(): Promise<PurgeResult> {
  const stats: PurgeResult = { scanned: 0, purged: 0, usersDeleted: 0, skipped: 0, errors: 0 };
  const retentionMs = env.MAILBOX_PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);

  const candidates = await prisma.mailbox.findMany({
    where: { status: 'pending_deletion', updatedAt: { lt: cutoff } },
    select: { id: true, address: true, tenantId: true, updatedAt: true },
  });
  stats.scanned = candidates.length;
  if (candidates.length === 0) return stats;

  logger.info({ candidates: candidates.length, cutoff }, 'mailbox_purge_sweep_start');

  for (const mb of candidates) {
    try {
      // 1. Find the owner-User (may be null for very old orphans).
      const ownerMembership = await prisma.tenantMember.findFirst({
        where: { mailboxId: mb.id, role: 'member' },
      });
      const ownerUserId = ownerMembership?.userId ?? null;
      const otherMembershipCount = ownerUserId
        ? await prisma.tenantMember.count({ where: { userId: ownerUserId, mailboxId: { not: mb.id } } })
        : 0;

      // 2. rm -rf the Maildir via sudo helper. If the address is malformed
      //    the helper refuses (safe). If the directory doesn't exist the
      //    helper exits 0 (also safe — treat as already-purged).
      const parts = splitAddress(mb.address);
      if (!parts) {
        logger.warn({ address: mb.address, mailboxId: mb.id }, 'purge_skip_bad_address');
        stats.skipped++;
        continue;
      }
      const target = `${parts.domain}/${parts.localPart}`;
      try {
        const out = await runCommand('sudo', ['-n', PURGE_HELPER, target]);
        logger.info({ target, out: out.stdout.trim() }, 'purge_maildir_ok');
      } catch (err) {
        // The helper failed — most likely the sudoers rule hasn't been
        // deployed yet OR the helper script isn't installed. DO NOT proceed
        // with DB deletion in that case: we'd leave orphaned mail on disk
        // that nobody could reach because the auth rows are gone. Log and
        // move on — next tick tries again.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), target, mailboxId: mb.id },
          'purge_maildir_failed_leaving_db_intact',
        );
        stats.errors++;
        continue;
      }

      // 3. Hard-delete the mailbox + owner-User (if orphaned) + audit event
      //    in a single transaction. Mailbox delete cascades Folder/Alias/
      //    MigrationJob/ExportJob/AutoReply/MailFilter via schema.prisma.
      //    TenantMember.mailboxId is SetNull — but we're about to delete
      //    the User anyway if orphaned, which cascade-removes the membership.
      const deleteUser = Boolean(ownerUserId) && otherMembershipCount === 0;
      await prisma.$transaction([
        prisma.auditEvent.create({
          data: {
            tenantId: mb.tenantId,
            actorUserId: null,
            action: 'mailbox.purged',
            targetType: 'mailbox',
            targetId: mb.id,
            metadata: {
              address: mb.address,
              pendingSince: mb.updatedAt.toISOString(),
              retentionDays: env.MAILBOX_PURGE_RETENTION_DAYS,
              maildirPath: `/var/vmail/${target}`,
              ownerUserDeleted: deleteUser,
              ownerUserId: ownerUserId,
              ownerHadOtherMemberships: otherMembershipCount > 0,
            },
          },
        }),
        prisma.mailbox.delete({ where: { id: mb.id } }),
        ...(deleteUser
          ? [prisma.user.delete({ where: { id: ownerUserId! } })]
          : []),
      ]);
      stats.purged++;
      if (deleteUser) stats.usersDeleted++;
      logger.info(
        { mailboxId: mb.id, address: mb.address, userDeleted: deleteUser },
        'mailbox_purged',
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), mailboxId: mb.id },
        'purge_mailbox_failed',
      );
      stats.errors++;
    }
  }

  logger.info(stats, 'mailbox_purge_sweep_done');
  return stats;
}

export const mailboxPurgeWorker = new Worker<PurgeTickPayload>(
  QUEUE_NAMES.mailboxPurge,
  async (job: Job<PurgeTickPayload>) => {
    if (job.data.kind !== 'tick') return;
    try {
      await sweepPurgeableMailboxes();
    } catch (err) {
      logger.warn({ err }, 'mailbox_purge_sweep_failed');
    }
    await enqueueNextPurgeTick(PURGE_TICK_INTERVAL_MS);
  },
  { connection: bullConnection, concurrency: 1 },
);

mailboxPurgeWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'mailbox_purge_worker_failed');
});

export async function ensureMailboxPurgeTickSeeded(): Promise<void> {
  // Fixed jobId — re-seeding on boot is a no-op if a tick is already queued.
  await purgeQueue.add(
    'tick',
    { kind: 'tick' },
    {
      jobId: PURGE_SEED_JOB_ID,
      // Small delay so the API has time to open its DB pool first.
      delay: 60_000,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
