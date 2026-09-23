#!/usr/bin/env node
/**
 * BACKFILL — create the missing owner-User + TenantMember for every
 * mailbox that was provisioned before the /v1/mailboxes fix (which forgot
 * to create the application-identity User alongside the Dovecot mailbox).
 *
 * READ-ONLY BY DEFAULT. Pass --apply to actually write.
 *
 * WHAT COUNTS AS "ORPHANED"
 *   A mailbox row where no User exists with User.email == Mailbox.address.
 *   Those owners have working IMAP/SMTP (Dovecot reads Mailbox.passwordHash)
 *   but /v1/auth/login returns 401 (no matching User row).
 *
 * WHAT THE BACKFILL DOES (per orphaned mailbox)
 *   1. Creates User { email: mailbox.address, name: displayName || localPart,
 *                     passwordHash: mailbox.passwordHash,  <-- REUSED, not regenerated
 *                     status: mailboxStatusToUserStatus(mailbox.status) }
 *   2. Creates TenantMember { tenantId, userId, role: 'member',
 *                             mailboxId: mailbox.id }
 *   3. Writes an audit event mailbox.owner_user_backfilled scoped to the
 *      mailbox's tenant.
 *
 * SAFETY
 *   - Reuses the mailbox's existing argon2id hash — the customer's
 *     credential is unchanged. No password is generated, printed, or reset.
 *   - Uses a per-mailbox transaction — a single failure does not corrupt
 *     the rest of the run.
 *   - If a User row already exists for the address (rare — from a stray
 *     signup collision), the script logs a warning and SKIPS. Operator
 *     must resolve manually. It never overwrites an existing User's
 *     passwordHash.
 *   - If the tenant already has a TenantMember for that userId (also
 *     rare — same person is org owner AND now has a mailbox), the script
 *     tries to attach mailboxId to that existing membership; if the
 *     membership already has a different mailboxId set, skips.
 *
 * USAGE
 *   node scripts/backfill-mailbox-users.mjs           # dry-run
 *   node scripts/backfill-mailbox-users.mjs --apply   # write
 */

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function mailboxStatusToUserStatus(mbStatus) {
  // Mailbox: active | suspended | disabled | pending_deletion
  // User:    active | suspended | pending
  switch (mbStatus) {
    case 'active':
      return 'active';
    case 'suspended':
      return 'suspended';
    case 'disabled':
    case 'pending_deletion':
      return 'suspended';
    default:
      return 'active';
  }
}

const stats = {
  scanned: 0,
  alreadyLinked: 0,
  wouldCreate: 0,
  created: 0,
  attachedExistingUser: 0,
  skippedUserClash: 0,
  skippedMembershipClash: 0,
  errors: 0,
};

try {
  const mailboxes = await prisma.mailbox.findMany({
    select: {
      id: true,
      tenantId: true,
      address: true,
      localPart: true,
      displayName: true,
      passwordHash: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${mailboxes.length} mailboxes. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN'}`);

  for (const mb of mailboxes) {
    stats.scanned++;
    const existingUser = await prisma.user.findUnique({
      where: { email: mb.address },
      include: { memberships: true },
    });

    if (existingUser) {
      // A User with this email already exists. Is it linked to this mailbox?
      const linkedHere = existingUser.memberships.find(
        (m) => m.tenantId === mb.tenantId && m.mailboxId === mb.id,
      );
      if (linkedHere) {
        stats.alreadyLinked++;
        continue;
      }
      // User exists but not linked to this mailbox. Try to attach IF the
      // user already has membership in this tenant and no other mailbox.
      const sameTenantMembership = existingUser.memberships.find(
        (m) => m.tenantId === mb.tenantId,
      );
      if (sameTenantMembership && sameTenantMembership.mailboxId === null) {
        if (!APPLY) {
          console.log(`WOULD ATTACH: user ${mb.address} -> mailbox ${mb.id} (existing membership id=${sameTenantMembership.id})`);
          stats.wouldCreate++;
        } else {
          try {
            await prisma.$transaction([
              prisma.tenantMember.update({
                where: { id: sameTenantMembership.id },
                data: { mailboxId: mb.id },
              }),
              prisma.auditEvent.create({
                data: {
                  tenantId: mb.tenantId,
                  actorUserId: existingUser.id,
                  action: 'mailbox.owner_user_backfilled',
                  targetType: 'mailbox',
                  targetId: mb.id,
                  metadata: { mode: 'attached_existing_user', membershipId: sameTenantMembership.id },
                },
              }),
            ]);
            console.log(`ATTACHED: ${mb.address}`);
            stats.attachedExistingUser++;
          } catch (err) {
            console.error(`ERROR attaching ${mb.address}: ${err?.message ?? err}`);
            stats.errors++;
          }
        }
        continue;
      }
      // Existing user, membership situation is ambiguous — refuse to guess.
      console.warn(
        `SKIP (user clash): ${mb.address} — a User with this email exists ` +
          `but its membership state doesn't match this mailbox cleanly. ` +
          `Resolve manually. userId=${existingUser.id}, mailboxId=${mb.id}`,
      );
      stats.skippedUserClash++;
      continue;
    }

    // Happy path: no User row for this address. Create User + membership.
    if (!APPLY) {
      console.log(`WOULD CREATE: user + membership for ${mb.address} (mailbox ${mb.id})`);
      stats.wouldCreate++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: mb.address,
            name: mb.displayName ?? mb.localPart,
            passwordHash: mb.passwordHash, // REUSE — customer credential unchanged
            status: mailboxStatusToUserStatus(mb.status),
          },
        });
        await tx.tenantMember.create({
          data: {
            tenantId: mb.tenantId,
            userId: user.id,
            role: 'member',
            mailboxId: mb.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            tenantId: mb.tenantId,
            actorUserId: user.id,
            action: 'mailbox.owner_user_backfilled',
            targetType: 'mailbox',
            targetId: mb.id,
            metadata: { mode: 'created_user_and_membership' },
          },
        });
      });
      console.log(`CREATED: ${mb.address}`);
      stats.created++;
    } catch (err) {
      // Membership uniqueness violations land here — log + move on.
      if (err?.code === 'P2002') {
        console.warn(`SKIP (membership clash): ${mb.address} — ${err.meta?.target ?? 'unknown target'}`);
        stats.skippedMembershipClash++;
      } else {
        console.error(`ERROR creating ${mb.address}: ${err?.message ?? err}`);
        stats.errors++;
      }
    }
  }

  console.log('---');
  console.log('Summary:', stats);
  console.log(APPLY ? 'DONE.' : 'DRY-RUN complete. Re-run with --apply to write.');
  process.exit(stats.errors === 0 ? 0 : 4);
} catch (err) {
  console.error(`FATAL: ${err?.message ?? err}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
