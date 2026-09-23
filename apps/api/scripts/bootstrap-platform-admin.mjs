#!/usr/bin/env node
/**
 * One-shot bootstrap of the initial MailCloud platform super-administrator.
 *
 * DESIGN
 *   Inputs read from ENV VARS only (never argv) so the plaintext password
 *   never lands in `ps`, shell history, or a systemd journal that logs the
 *   command line. The script argon2id-hashes in-process and writes only the
 *   hash to Postgres. Password memory is best-effort cleared and never
 *   printed, echoed, or included in any thrown error.
 *
 * WHAT IT CREATES
 *   1. A system-internal tenant `platform` (name "MailCloud Platform") if it
 *      doesn't already exist. This tenant is NOT a customer organisation; its
 *      sole purpose is holding a valid tenantId FK for platform-level audit
 *      events (AuditEvent.tenantId is required — see schema.prisma).
 *   2. A User row with the given email + argon2id-hashed password.
 *      isPlatformAdmin STAYS FALSE at this stage — promotion happens only
 *      after the user has enrolled MFA, via the existing
 *      scripts/set-platform-admin.mjs.
 *   3. A TenantMember row linking the user to the platform tenant as
 *      role=member (least privilege — the admin authority does NOT derive
 *      from this membership; it comes from user.isPlatformAdmin=true after
 *      the MFA-gated promotion).
 *   4. An AuditEvent `user.platform_admin_provisioned` scoped to the
 *      platform tenant.
 *
 * REFUSAL RULES (safety)
 *   - Refuses if BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD is missing.
 *   - Refuses if password is shorter than 12 chars.
 *   - Refuses if a user with that email already exists (never clobbers).
 *   - Refuses if ANY user already has isPlatformAdmin=true — enforces
 *     "one initial super admin" from the operator brief. To add later
 *     admins, use set-platform-admin.mjs against an already-provisioned user.
 *
 * USAGE (from /opt/cloudmail/current/apps/api on the deployed box):
 *   export BOOTSTRAP_ADMIN_EMAIL='chipemberehorace@gmail.com'
 *   read -rs -p 'Temp password: ' BOOTSTRAP_ADMIN_PASSWORD; export BOOTSTRAP_ADMIN_PASSWORD; echo
 *   node scripts/bootstrap-platform-admin.mjs
 *   unset BOOTSTRAP_ADMIN_PASSWORD BOOTSTRAP_ADMIN_EMAIL
 *
 * The script deliberately does NOT support a CLI flag for the password;
 * that would leak into `ps auxf` and `history`.
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import os from 'node:os';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLATFORM_TENANT_SLUG = 'platform';
const PLATFORM_TENANT_NAME = 'MailCloud Platform';

// Argon2id params match apps/api/src/auth/password.ts so hashes are
// interchangeable with the runtime hashPassword() helper.
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

function fail(msg, code = 1) {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!rawEmail) fail('BOOTSTRAP_ADMIN_EMAIL is required (set in shell env, not argv).');
if (!EMAIL_RE.test(rawEmail)) fail('BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');
if (!password) fail('BOOTSTRAP_ADMIN_PASSWORD is required (set in shell env, not argv).');
if (password.length < 12) fail('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');

// Delete from process.env ASAP so nothing downstream (child processes,
// diagnostic dumps) can read it.
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

const prisma = new PrismaClient();

try {
  const existingByEmail = await prisma.user.findUnique({ where: { email: rawEmail } });
  if (existingByEmail) {
    fail(
      `A user with email ${rawEmail} already exists (id=${existingByEmail.id}). ` +
        `This script provisions only the FIRST admin; refusing to clobber. ` +
        `To promote an existing user, use scripts/set-platform-admin.mjs.`,
      2,
    );
  }

  const anyExistingAdmin = await prisma.user.findFirst({
    where: { isPlatformAdmin: true },
    select: { id: true, email: true },
  });
  if (anyExistingAdmin) {
    fail(
      `A platform administrator already exists (${anyExistingAdmin.email}). ` +
        `This script is for the INITIAL bootstrap only. ` +
        `To grant additional admins, use scripts/set-platform-admin.mjs on an existing user.`,
      3,
    );
  }

  const passwordHash = await argon2.hash(password, ARGON2_OPTS);
  password = null; // best-effort GC hint; not a security guarantee in V8

  const result = await prisma.$transaction(async (tx) => {
    let platformTenant = await tx.tenant.findUnique({ where: { slug: PLATFORM_TENANT_SLUG } });
    if (!platformTenant) {
      platformTenant = await tx.tenant.create({
        data: {
          slug: PLATFORM_TENANT_SLUG,
          name: PLATFORM_TENANT_NAME,
          plan: 'platform',
          status: 'active',
        },
      });
    }

    const user = await tx.user.create({
      data: {
        email: rawEmail,
        name: 'Horace Chipembere',
        passwordHash,
        status: 'active',
        isPlatformAdmin: false, // stays false until MFA-gated promotion
      },
    });

    await tx.tenantMember.create({
      data: {
        tenantId: platformTenant.id,
        userId: user.id,
        role: 'member',
      },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: platformTenant.id,
        actorUserId: user.id,
        action: 'user.platform_admin_provisioned',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          source: 'bootstrap-platform-admin.mjs',
          hostname: os.hostname(),
          note: 'Account provisioned. isPlatformAdmin=false until MFA enrol + set-platform-admin.mjs.',
        },
      },
    });

    return { user, tenant: platformTenant };
  });

  console.log('---');
  console.log('Platform admin PROVISIONED (not yet promoted).');
  console.log(`  email:             ${result.user.email}`);
  console.log(`  user id:           ${result.user.id}`);
  console.log(`  platform tenant:   ${result.tenant.slug} (${result.tenant.id})`);
  console.log(`  isPlatformAdmin:   false  <-- flips true after step 3`);
  console.log(`  mfaEnabled:        false  <-- must enrol in step 2`);
  console.log('---');
  console.log('NEXT STEPS');
  console.log('  1. Log in at https://mail.digiskills.live/login with the temp password.');
  console.log('  2. Open /settings/security and enrol TOTP MFA. Save recovery codes offline.');
  console.log('  3. From this server, run: node scripts/set-platform-admin.mjs ' + result.user.email);
  console.log('     (Refuses unless mfaEnabled=true — safe by design.)');
  console.log('  4. Set PLATFORM_ADMIN_REQUIRE_MFA=true in /etc/cloudmail/api.env, then');
  console.log('     systemctl restart cloudmail-api.');
  console.log('  5. Log in at /admin/login and immediately change the temp password.');
  process.exit(0);
} catch (err) {
  // Never let the plaintext password appear in an error message, even by
  // accident. err.message from Prisma/argon2 doesn't include it, but be
  // paranoid: only print the class + short summary.
  const cls = err?.constructor?.name ?? 'Error';
  const msg = typeof err?.message === 'string' ? err.message.slice(0, 500) : String(err);
  console.error(`${cls}: ${msg}`);
  process.exit(10);
} finally {
  await prisma.$disconnect();
}
