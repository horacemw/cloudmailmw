#!/usr/bin/env node
/**
 * Grant or revoke platform-admin (super-admin) on an existing user.
 *
 * MailCloud has two paths to super-admin authority:
 *   1) Bootstrap: user.email appears in the PLATFORM_ADMIN_EMAILS env var.
 *      Requires an API restart to change; useful for the very first admin.
 *   2) Persistent: user.isPlatformAdmin = true in the database.
 *      This script flips that flag.
 *
 * Refuses to grant if the user hasn't enrolled MFA (safety default), unless
 * --force is passed — that keeps a bootstrap admin from being locked into a
 * powerful role without a second factor. Every action is audited.
 *
 * Usage (from the deployed API root, /opt/cloudmail/current/apps/api):
 *   node scripts/set-platform-admin.mjs owner@example.com
 *   node scripts/set-platform-admin.mjs owner@example.com --revoke
 *   node scripts/set-platform-admin.mjs owner@example.com --force
 */

import { PrismaClient } from '@prisma/client';

const email = process.argv[2]?.toLowerCase().trim();
const revoke = process.argv.includes('--revoke');
const force = process.argv.includes('--force');
const grant = !revoke;

if (!email || email.startsWith('--')) {
  console.error('Usage: node scripts/set-platform-admin.mjs <email> [--revoke] [--force]');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email: ${email}`);
    process.exit(2);
  }

  if (grant && user.isPlatformAdmin) {
    console.log(`No-op: ${email} is already a platform admin.`);
    process.exit(0);
  }
  if (revoke && !user.isPlatformAdmin) {
    console.log(`No-op: ${email} is not a platform admin.`);
    process.exit(0);
  }

  if (grant && !user.mfaEnabled && !force) {
    console.error(`Refusing to grant: ${email} has not enrolled MFA.`);
    console.error('Ask the user to run through /v1/auth/mfa/setup and /verify first,');
    console.error('or rerun with --force to override (not recommended for production).');
    process.exit(3);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformAdmin: grant },
  });

  // Audit under every tenant the user is a member of, so the trail is visible
  // from whichever org dashboard someone is looking at.
  const memberships = await prisma.tenantMember.findMany({ where: { userId: user.id } });
  if (memberships.length > 0) {
    await prisma.auditEvent.createMany({
      data: memberships.map((m) => ({
        tenantId: m.tenantId,
        actorUserId: user.id,
        action: grant ? 'user.platform_admin_granted' : 'user.platform_admin_revoked',
        targetType: 'user',
        targetId: user.id,
        metadata: { forced: grant ? force : undefined },
      })),
    });
  }

  console.log(`${grant ? 'GRANTED' : 'REVOKED'} platform_admin: ${updated.email} (id=${updated.id})`);
  process.exit(0);
} finally {
  await prisma.$disconnect();
}
