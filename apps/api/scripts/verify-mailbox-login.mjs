#!/usr/bin/env node
/**
 * Verify that a mailbox owner can complete /v1/auth/login end-to-end.
 * Reads email + password from env vars (never argv). Exits 0 on
 * successful token issuance, non-zero with a clear error otherwise.
 *
 * Also runs three negative controls to prove the fix did not weaken
 * authentication:
 *   - wrong password for the same email  -> must return 401
 *   - random non-existent email          -> must return 401 (same shape)
 *   - empty payload                      -> must return 400
 *
 * USAGE
 *   export VERIFY_BASE_URL='https://mail.digiskills.live'
 *   export VERIFY_EMAIL='info@njingatracker.online'
 *   read -rs -p 'Password: ' VERIFY_PASSWORD; export VERIFY_PASSWORD; echo
 *   node scripts/verify-mailbox-login.mjs
 *   unset VERIFY_PASSWORD
 */

const BASE = process.env.VERIFY_BASE_URL?.replace(/\/+$/, '') ?? 'https://mail.digiskills.live';
const EMAIL = process.env.VERIFY_EMAIL?.trim().toLowerCase();
const PASSWORD = process.env.VERIFY_PASSWORD;

if (!EMAIL) {
  console.error('ERROR: VERIFY_EMAIL is required (set in env, not argv).');
  process.exit(1);
}
if (!PASSWORD) {
  console.error('ERROR: VERIFY_PASSWORD is required (set in env, not argv).');
  process.exit(1);
}
delete process.env.VERIFY_PASSWORD;

let failures = 0;
function ok(msg) { console.log('  ✓', msg); }
function bad(msg) { console.log('  ✗', msg); failures++; }

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

console.log(`Target: ${BASE}`);
console.log(`Email:  ${EMAIL}`);
console.log('');

console.log('1. Happy path (real credentials)');
{
  const r = await post('/v1/auth/login', { email: EMAIL, password: PASSWORD });
  if (r.status === 200 && typeof r.body?.accessToken === 'string' && r.body.accessToken.length > 20) {
    ok(`200 with accessToken length=${r.body.accessToken.length}`);
    // Follow up: /v1/auth/me should return the mailbox owner's identity.
    const me = await fetch(`${BASE}/v1/auth/me`, {
      headers: { authorization: `Bearer ${r.body.accessToken}` },
    });
    const meBody = await me.json().catch(() => null);
    if (me.status === 200 && meBody?.user?.email === EMAIL) {
      ok(`/v1/auth/me returns user.email=${meBody.user.email}, tenants=${meBody.tenants.length}`);
      if (meBody.tenants.some((t) => t.role === 'member')) ok('  tenant role includes "member" (owner-user link OK)');
      else bad(`  expected role "member" in tenants list, got: ${meBody.tenants.map((t) => t.role).join(',')}`);
    } else {
      bad(`/v1/auth/me: status=${me.status} body=${JSON.stringify(meBody).slice(0, 200)}`);
    }
  } else if (r.status === 200 && r.body?.needsMfa) {
    ok(`MFA challenge issued (needsMfa=true) — auth layer works; MFA prompt is separate flow.`);
  } else {
    bad(`login failed: status=${r.status} body=${JSON.stringify(r.body)}`);
  }
}

console.log('\n2. Wrong password (same email) — must be 401 bad_credentials');
{
  const r = await post('/v1/auth/login', { email: EMAIL, password: 'definitely-not-the-password-9827' });
  if (r.status === 401 && r.body?.error?.code === 'bad_credentials') ok('401 bad_credentials');
  else bad(`expected 401 bad_credentials, got ${r.status} ${JSON.stringify(r.body)}`);
}

console.log('\n3. Non-existent email — must be 401 bad_credentials (same shape, no enumeration leak)');
{
  const rnd = `no-such-user-${Date.now()}@example.invalid`;
  const r = await post('/v1/auth/login', { email: rnd, password: 'anything-that-parses' });
  if (r.status === 401 && r.body?.error?.code === 'bad_credentials') ok('401 bad_credentials (indistinguishable from wrong-password)');
  else bad(`expected 401 bad_credentials, got ${r.status} ${JSON.stringify(r.body)}`);
}

console.log('\n4. Malformed payload — must be 400');
{
  const r = await post('/v1/auth/login', { email: 'not-an-email', password: '' });
  if (r.status === 400) ok('400 on malformed input');
  else bad(`expected 400, got ${r.status} ${JSON.stringify(r.body)}`);
}

console.log('');
if (failures === 0) {
  console.log('ALL CHECKS PASSED.');
  process.exit(0);
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(2);
}
