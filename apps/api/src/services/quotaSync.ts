import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { notifyTenantAdmins } from './notify.js';
import { withImap } from '../mail/imapClient.js';
import { logger } from '../lib/logger.js';

/**
 * Mailbox usage sync.
 *
 * Uses the standard IMAP QUOTA extension (RFC 2087) via the existing master-
 * user login — no elevated privileges or sudoers rules needed. Dovecot is
 * built with the imap_quota plugin loaded (`mail_plugins = ... imap_quota`
 * inside `protocol imap {}`), so `GETQUOTAROOT INBOX` returns the STORAGE
 * usage in kilobytes.
 *
 * Called from:
 *  - `workers/quotaWorker.ts`  — periodic sweep every 15 min
 *  - `routes/mail.ts`          — after send (single-mailbox refresh)
 *  - `routes/mailboxes.ts`     — POST /:id/sync-usage from the dashboard
 */

const THRESHOLDS = [80, 95, 100] as const;

interface ImapQuotaResult {
  usedBytes: bigint;
  limitBytes: bigint | null;
}

async function fetchQuotaOverImap(address: string): Promise<ImapQuotaResult | null> {
  try {
    return await withImap({ mailboxAddress: address }, async (client) => {
      // imapflow exposes getQuota/getQuotaRoot — use the root variant so we
      // don't need to know the storage root name up-front.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyClient = client as any;
      let usedKb: number | null = null;
      let limitKb: number | null = null;
      if (typeof anyClient.getQuota === 'function') {
        // getQuota takes a mailbox path; INBOX is guaranteed to exist.
        const q = await anyClient.getQuota('INBOX').catch(() => null);
        if (q?.storage) {
          usedKb = typeof q.storage.usage === 'number' ? q.storage.usage : null;
          limitKb = typeof q.storage.limit === 'number' ? q.storage.limit : null;
        }
      }
      if (usedKb == null) return null;
      return {
        usedBytes: BigInt(usedKb) * 1024n,
        limitBytes: limitKb != null ? BigInt(limitKb) * 1024n : null,
      };
    });
  } catch (err) {
    logger.debug({ address, err: (err as Error).message }, 'quota_over_imap_failed');
    return null;
  }
}

/**
 * Sync one mailbox's usage. Idempotent. Only writes when the value changes.
 * Fires quota_warning at 80% / 95% / 100% crossings (dedup 24 h per threshold).
 */
export async function syncMailboxUsage(mailboxId: string): Promise<void> {
  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox || mailbox.status === 'pending_deletion') return;

  const result = await fetchQuotaOverImap(mailbox.address);
  if (!result) return;

  const usedBytes = result.usedBytes;
  // Cloud Mail is the source of truth for quota policy; ignore IMAP's limit.
  const quotaBytes = mailbox.quotaBytes;

  if (usedBytes !== mailbox.usedBytes) {
    await prisma.mailbox.update({
      where: { id: mailbox.id },
      data: { usedBytes },
    });
  }

  if (quotaBytes <= 0n) return;
  const percent = Number((usedBytes * 100n) / quotaBytes);
  for (const threshold of THRESHOLDS) {
    if (percent < threshold) continue;
    const key = `cm:quota-warn:${mailbox.id}:${threshold}`;
    const set = await redis.set(key, '1', 'EX', 24 * 60 * 60, 'NX');
    if (set === null) continue; // already notified for this threshold today
    await notifyTenantAdmins({
      tenantId: mailbox.tenantId,
      kind: 'quota_warning',
      title:
        threshold === 100
          ? `Mailbox ${mailbox.address} is FULL`
          : `${mailbox.address} at ${threshold}% of quota`,
      body:
        threshold === 100
          ? 'New messages will be rejected until you raise the quota or delete mail.'
          : 'Consider raising the quota or archiving old messages before the mailbox fills up.',
      targetType: 'mailbox',
      targetId: mailbox.id,
    });
  }
}

/**
 * Sweep every non-pending mailbox. Runs sequentially to keep IMAP load bounded.
 */
export async function syncAllMailboxes(): Promise<{ scanned: number }> {
  const mailboxes = await prisma.mailbox.findMany({
    where: { status: { in: ['active', 'suspended'] } },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
  });
  for (const m of mailboxes) {
    try {
      await syncMailboxUsage(m.id);
    } catch (err) {
      logger.warn({ err, mailboxId: m.id }, 'quota_sync_failed');
    }
  }
  return { scanned: mailboxes.length };
}
