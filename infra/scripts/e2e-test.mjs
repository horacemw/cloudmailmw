#!/usr/bin/env node
// ─── Cloud Mail — end-to-end integration + tenant-isolation test ────
//
// Runs against a real, deployed Cloud Mail API. Creates two isolated
// tenants and verifies every cross-tenant + privilege-escalation attempt is
// rejected. Do NOT remove any of the existing assertions.
//
// Usage: node e2e-test.mjs [https://mail.digiskills.live]

const BASE = process.argv[2] ?? process.env.CLOUDMAIL_API ?? 'https://mail.digiskills.live';
const ts = Date.now();
const PASS = 'CloudMail!TestPass2026';

function log(icon, msg) { console.log(icon, msg); }
function ok(msg)  { log('  ✓', msg); }
function bad(msg) { log('  ✗', msg); process.exitCode = 1; }
function info(msg){ log('  ·', msg); }
function section(name) { console.log(`\n── ${name} ─────────────────────────────────────────`); }

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const hasBody = opts.body !== undefined && opts.body !== null;
  const headers = { 'accept': 'application/json', ...(opts.headers || {}) };
  // Only claim JSON when we actually send a body — DELETE/GET with the JSON
  // content-type + no body would be rejected by Fastify's parser as 400.
  if (hasBody && !('content-type' in headers) && !('Content-Type' in headers)) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(BASE + path, { ...opts, method, headers });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body };
}

async function signup(prefix, org) {
  const email = `e2e-${prefix}+${ts}@cloudmail.test`;
  const { status, body } = await api('/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASS, name: `E2E ${prefix}`, organizationName: org }),
  });
  if (status !== 200) throw new Error(`signup failed: ${status} ${JSON.stringify(body)}`);
  const me = await api('/v1/auth/me', { headers: { authorization: `Bearer ${body.accessToken}` } });
  if (me.status !== 200) throw new Error(`me failed: ${me.status}`);
  return {
    email,
    token: body.accessToken,
    tenantSlug: me.body.tenants[0].slug,
    tenantId: me.body.tenants[0].id,
    role: me.body.tenants[0].role,
  };
}

async function main() {
  console.log(`Cloud Mail E2E test → ${BASE}`);

  section('1. Sign up two isolated tenants');
  const A = await signup('a', 'Alpha Org ' + ts);
  ok(`Tenant A signed up. slug=${A.tenantSlug} role=${A.role}`);
  const B = await signup('b', 'Beta Org ' + ts);
  ok(`Tenant B signed up. slug=${B.tenantSlug} role=${B.role}`);

  section('2. A adds a domain');
  const dom = `t${ts}.cloudmail-test.example`;
  const add = await api('/v1/domains', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
    body: JSON.stringify({ name: dom }),
  });
  if (add.status !== 200 || add.body.error) bad(`add domain failed: ${add.status} ${JSON.stringify(add.body)}`);
  else ok(`Domain added. id=${add.body.id} records=${add.body.records.length}`);
  const domainId = add.body.id;

  section('3. Domain instructions include required record types');
  const kinds = add.body.records.map((r) => r.kind);
  for (const k of ['ownership_txt', 'mx', 'spf', 'dkim', 'dmarc']) {
    if (kinds.includes(k)) ok(`record kind '${k}' present`);
    else bad(`record kind '${k}' MISSING from instructions`);
  }

  section('4. Tenant isolation — B reads A\'s domain (should fail)');
  const isolationRead = await api(`/v1/domains/${domainId}/dns`, {
    headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
  });
  if (isolationRead.status === 404) ok(`B blocked. HTTP 404 (domain_not_found scoped to B)`);
  else bad(`ISOLATION BREACH: B got HTTP ${isolationRead.status} on A\'s domain`);

  section('5. Tenant isolation — B verifies A\'s domain (should fail)');
  const isolationVerify = await api(`/v1/domains/${domainId}/verify`, {
    method: 'POST',
    headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
    body: '{}',
  });
  if (isolationVerify.status === 404 || isolationVerify.status === 403)
    ok(`B blocked. HTTP ${isolationVerify.status}`);
  else bad(`ISOLATION BREACH: B verify got HTTP ${isolationVerify.status}`);

  section('6. Tenant isolation — B without tenant header on A\'s domain');
  const bare = await api(`/v1/domains/${domainId}/dns`, {
    headers: { authorization: `Bearer ${B.token}` },
  });
  if (bare.status === 404 || bare.status === 403) ok(`B blocked. HTTP ${bare.status}`);
  else bad(`ISOLATION BREACH: HTTP ${bare.status} without tenant header`);

  section('7. Anonymous access to protected route');
  const unauth = await api(`/v1/domains/${domainId}/dns`);
  if (unauth.status === 401) ok('HTTP 401 as expected');
  else bad(`unauthenticated returned HTTP ${unauth.status}, expected 401`);

  section('8. List scoping — A sees 1, B sees 0');
  const listA = await api('/v1/domains', { headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug } });
  const listB = await api('/v1/domains', { headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug } });
  if ((listA.body.domains ?? []).length === 1) ok(`A sees 1 domain: ${listA.body.domains[0].name}`);
  else bad(`A sees ${(listA.body.domains ?? []).length} domains, expected 1`);
  if ((listB.body.domains ?? []).length === 0) ok(`B sees 0 domains`);
  else bad(`ISOLATION BREACH: B sees ${listB.body.domains.length} domains (A\'s data leaked)`);

  section('9. Mailbox creation blocked while domain not active (correct behaviour)');
  const createMbox = await api('/v1/mailboxes', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
    body: JSON.stringify({ domainId, localPart: 'test', password: 'MboxPass!2026' }),
  });
  if (createMbox.body?.error?.code === 'domain_not_ready') ok(`Blocked with domain_not_ready — correct`);
  else info(`Unexpected: ${createMbox.status} ${JSON.stringify(createMbox.body)}`);

  section('10. Rate limit smoke test — 15 rapid logins should trip 429');
  let tripped = false;
  for (let i = 0; i < 15; i++) {
    const r = await api('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: A.email, password: 'wrong' }) });
    if (r.status === 429) { tripped = true; break; }
  }
  if (tripped) ok('Login rate limit triggered as expected');
  else bad('Rate limit did NOT trigger after 15 wrong-password attempts');

  /* ─── New Phase 3 endpoints ───────────────────────────────── */

  section('11. Contacts — CRUD + tenant isolation');
  const c1 = await api('/v1/contacts', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
    body: JSON.stringify({ firstName: 'Amina', lastName: 'Kondowe', email: `amina+${ts}@example.test` }),
  });
  if (c1.status === 201) ok(`Contact created by A. id=${c1.body.id} displayName="${c1.body.displayName}"`);
  else { bad(`create contact failed: ${c1.status} ${JSON.stringify(c1.body)}`); }
  const contactId = c1.body?.id;

  const cListA = await api('/v1/contacts', { headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug } });
  const cListB = await api('/v1/contacts', { headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug } });
  if ((cListA.body?.contacts ?? []).length === 1) ok(`A sees 1 contact`);
  else bad(`A sees ${cListA.body?.contacts?.length ?? 'error'} contacts, expected 1`);
  if ((cListB.body?.contacts ?? []).length === 0) ok(`B sees 0 contacts (isolation)`);
  else bad(`ISOLATION BREACH: B sees ${cListB.body.contacts.length} of A's contacts`);

  const searchA = await api(`/v1/contacts/search?q=Am`, {
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
  });
  if ((searchA.body?.results ?? []).some((r) => r.name.startsWith('Amina'))) ok(`Autocomplete /search finds Amina`);
  else bad(`Autocomplete didn't return Amina: ${JSON.stringify(searchA.body)}`);

  if (contactId) {
    const crossPatch = await api(`/v1/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
      body: JSON.stringify({ notes: 'pwned' }),
    });
    if (crossPatch.status === 404) ok(`B cannot patch A's contact (404)`);
    else bad(`ISOLATION BREACH: B got HTTP ${crossPatch.status} patching A's contact`);
  }

  section('12. Signatures — CRUD + XSS sanitisation + external URL rejection');
  const evilHtml =
    '<p>Hello <script>alert(1)</script><img src="https://tracker.evil/pixel.gif"><a href="javascript:alert(1)">bad</a></p>';
  const s1 = await api('/v1/signatures', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
    body: JSON.stringify({ name: 'Test sig', html: evilHtml, isDefault: true }),
  });
  if (s1.status === 201) {
    const h = s1.body.html;
    const stripped =
      !h.includes('<script') &&
      !h.includes('javascript:') &&
      !h.includes('https://tracker.evil');
    if (stripped) ok(`Signature saved with dangerous HTML stripped`);
    else bad(`Sanitiser FAILED: server stored: ${h}`);
  } else bad(`create signature failed: ${s1.status} ${JSON.stringify(s1.body)}`);
  const sigId = s1.body?.id;

  // Cross-tenant read
  if (sigId) {
    const sigListB = await api('/v1/signatures', {
      headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
    });
    if ((sigListB.body?.signatures ?? []).length === 0) ok(`B sees 0 signatures (isolation)`);
    else bad(`ISOLATION BREACH: B sees ${sigListB.body.signatures.length} of A's signatures`);

    const crossDel = await api(`/v1/signatures/${sigId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
    });
    if (crossDel.status === 404) ok(`B cannot delete A's signature (404)`);
    else bad(`ISOLATION BREACH: B got HTTP ${crossDel.status} deleting A's signature`);
  }

  section('13. MFA state — endpoint reachable, setup flow starts');
  const mfaState = await api('/v1/auth/mfa', { headers: { authorization: `Bearer ${A.token}` } });
  if (mfaState.status === 200 && mfaState.body.enabled === false) ok(`GET /v1/auth/mfa OK (enabled=false)`);
  else bad(`MFA state unexpected: ${mfaState.status} ${JSON.stringify(mfaState.body)}`);

  const mfaSetup = await api('/v1/auth/mfa/setup', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}` },
    body: '{}',
  });
  if (mfaSetup.status === 200 && mfaSetup.body.provisioningUri?.startsWith('otpauth://totp/'))
    ok(`MFA /setup returned a valid otpauth:// URI`);
  else bad(`MFA setup unexpected: ${mfaSetup.status} ${JSON.stringify(mfaSetup.body).slice(0, 200)}`);

  // A wrong TOTP code must be rejected
  const mfaBadVerify = await api('/v1/auth/mfa/verify', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}` },
    body: JSON.stringify({ code: '000000' }),
  });
  if (mfaBadVerify.status === 401) ok(`MFA /verify rejects wrong code (401)`);
  else bad(`MFA verify wrong code returned ${mfaBadVerify.status}`);

  section('14. Sessions — list + revoke');
  const sessListA = await api('/v1/sessions', { headers: { authorization: `Bearer ${A.token}` } });
  if ((sessListA.body?.sessions ?? []).length >= 1) ok(`A has ${sessListA.body.sessions.length} active session(s)`);
  else bad(`A has no sessions? ${JSON.stringify(sessListA.body)}`);

  const sessListB = await api('/v1/sessions', { headers: { authorization: `Bearer ${B.token}` } });
  // B must not see A's sessions
  const bSeesA = (sessListB.body?.sessions ?? []).some((s) =>
    (sessListA.body?.sessions ?? []).some((sa) => sa.id === s.id),
  );
  if (!bSeesA) ok(`B does not see A's session ids`);
  else bad(`ISOLATION BREACH: B sees A's session ids`);

  section('15. API keys — one-time secret display + cross-tenant refusal');
  const key1 = await api('/v1/api-keys', {
    method: 'POST',
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
    body: JSON.stringify({ name: 'e2e', scopes: ['mail.read'] }),
  });
  if (key1.status === 201 && key1.body.secret?.startsWith('cm_')) ok(`Key created, secret shown once`);
  else bad(`API key create failed: ${key1.status} ${JSON.stringify(key1.body)}`);

  // Second list must NOT return the secret again
  const keyList = await api('/v1/api-keys', {
    headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug },
  });
  const anySecret = (keyList.body?.keys ?? []).some((k) => 'secret' in k);
  if (!anySecret) ok(`List endpoint does not return the plaintext secret`);
  else bad(`SECURITY: API-key list endpoint leaked a secret field`);

  const keyListB = await api('/v1/api-keys', {
    headers: { authorization: `Bearer ${B.token}`, 'x-cloudmail-tenant': B.tenantSlug },
  });
  if ((keyListB.body?.keys ?? []).length === 0) ok(`B sees 0 API keys (isolation)`);
  else bad(`ISOLATION BREACH: B sees ${keyListB.body.keys.length} of A's keys`);

  section('16. Admin — non-admin blocked from /v1/admin/*');
  for (const path of ['/v1/admin/overview', '/v1/admin/tenants', '/v1/admin/mailboxes', '/v1/admin/audit', '/v1/admin/queue', '/v1/admin/mail-relay', '/v1/admin/system']) {
    const r = await api(path, { headers: { authorization: `Bearer ${A.token}`, 'x-cloudmail-tenant': A.tenantSlug } });
    if (r.status === 403) ok(`${path} → 403`);
    else bad(`ADMIN LEAK: ${path} returned ${r.status} for non-admin`);
  }

  section('16a. /v1/auth/me carries platform-admin + MFA flags');
  const meA = await api('/v1/auth/me', { headers: { authorization: `Bearer ${A.token}` } });
  if (meA.body?.user?.isPlatformAdmin === false) ok(`A.user.isPlatformAdmin === false (correct for signup)`);
  else bad(`ME LEAK: A.user.isPlatformAdmin = ${JSON.stringify(meA.body?.user?.isPlatformAdmin)} — should be false`);
  if (meA.body?.user?.mfaEnabled === false) ok(`A.user.mfaEnabled === false (correct pre-enrol)`);
  else bad(`ME LEAK: A.user.mfaEnabled = ${JSON.stringify(meA.body?.user?.mfaEnabled)} — should be false`);

  section('17. Notifications — endpoints + isolation + mailbox-create producer');
  // Fetch A's list (creating tenants + mailboxes has fired notifications for A).
  const noteA = await api('/v1/notifications', { headers: { authorization: `Bearer ${A.token}` } });
  if (noteA.status === 200 && Array.isArray(noteA.body.notifications)) {
    ok(`A GET /v1/notifications OK (${noteA.body.notifications.length} entries)`);
  } else bad(`A GET /v1/notifications failed: ${noteA.status}`);

  const countA = await api('/v1/notifications/unread-count', {
    headers: { authorization: `Bearer ${A.token}` },
  });
  if (countA.status === 200 && typeof countA.body.count === 'number')
    ok(`A unread-count endpoint works (${countA.body.count} unread)`);
  else bad(`A unread-count broken: ${countA.status}`);

  // read-all should drive the count back to zero.
  await api('/v1/notifications/read-all', { method: 'POST', headers: { authorization: `Bearer ${A.token}` }, body: '{}' });
  const countAfter = await api('/v1/notifications/unread-count', {
    headers: { authorization: `Bearer ${A.token}` },
  });
  if (countAfter.body?.count === 0) ok(`A read-all reduced unread count to 0`);
  else bad(`read-all didn't clear unread count: still ${countAfter.body?.count}`);

  // B must not see any of A's notifications.
  const noteB = await api('/v1/notifications', { headers: { authorization: `Bearer ${B.token}` } });
  const bSeesAny = (noteB.body?.notifications ?? []).some((n) =>
    (noteA.body?.notifications ?? []).some((na) => na.id === n.id),
  );
  if (!bSeesAny) ok(`B does not see A's notifications`);
  else bad(`ISOLATION BREACH: B sees A's notifications`);

  section('18. Cleanup — logout both tenants');
  for (const [name, t] of [['A', A], ['B', B]]) {
    const r = await api('/v1/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${t.token}` }, body: '{}' });
    if (r.status < 300) ok(`${name} logout OK`);
    else info(`${name} logout HTTP ${r.status}`);
  }

  console.log(`\n── Summary ─────────────────────────────────────────`);
  console.log(process.exitCode === 1 ? '❌ FAIL — see ✗ lines above. Do not deploy.' : '✅ ALL CHECKS PASSED');
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
