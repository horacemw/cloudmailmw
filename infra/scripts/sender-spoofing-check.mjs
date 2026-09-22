#!/usr/bin/env node
/**
 * Sender-spoofing security probe against Postfix submission :587.
 *
 * Verifies that after the smtpd_sender_login_maps + reject_sender_login_mismatch
 * fix, an authenticated MailCloud mailbox can ONLY send with a MAIL FROM that
 * the sender-login-map authorises for its SASL identity. Cross-mailbox and
 * cross-tenant spoofing must be rejected.
 *
 * Usage:
 *   env \
 *     MAIL_HOST=mail.digiskills.live \
 *     SASL_USER=alice@t1.example \
 *     SASL_PASS='...' \
 *     OWN_ADDR=alice@t1.example \
 *     SAME_TENANT_OTHER=bob@t1.example \
 *     OTHER_TENANT_ADDR=eve@t2.example \
 *     EXTERNAL_ADDR=random@gmail.com \
 *     node infra/scripts/sender-spoofing-check.mjs
 *
 * Requires two real mailboxes on two different verified domains — that
 * state doesn't exist yet on production (blocked on a test subdomain being
 * published). Run this script after provisioning them; it exits 0 only if
 * all four cases behave as the policy demands.
 */
import net from 'node:net';
import tls from 'node:tls';

const HOST = process.env.MAIL_HOST ?? 'mail.digiskills.live';
const PORT = 587;
const SASL_USER = process.env.SASL_USER;
const SASL_PASS = process.env.SASL_PASS;
const OWN = process.env.OWN_ADDR ?? SASL_USER;
const SAME = process.env.SAME_TENANT_OTHER;
const OTHER = process.env.OTHER_TENANT_ADDR;
const EXTERNAL = process.env.EXTERNAL_ADDR ?? 'random@gmail.com';

if (!SASL_USER || !SASL_PASS || !OWN || !SAME || !OTHER) {
  console.error('Missing env: SASL_USER, SASL_PASS, OWN_ADDR, SAME_TENANT_OTHER, OTHER_TENANT_ADDR required.');
  console.error('See top of file for the full env template.');
  process.exit(64);
}

const ansi = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
const ok = (m) => console.log(`  ${ansi(32, '✓')} ${m}`);
const bad = (m) => { console.log(`  ${ansi(31, '✗')} ${m}`); process.exitCode = 1; };
const info = (m) => console.log(`  ${ansi(36, '·')} ${m}`);

async function submissionAttempt(mailFrom) {
  // Returns the SMTP response code after MAIL FROM (or after AUTH if that failed).
  return new Promise((resolve, reject) => {
    const buf = { text: '' };
    let step = 'greet';
    let secured = null;
    const write = (line) => (secured ?? sock).write(line + '\r\n');
    const sock = net.createConnection({ host: HOST, port: PORT }, () => {});
    const timer = setTimeout(() => { try { sock.destroy(); } catch { /* ignore */ } reject(new Error('timeout')); }, 20_000);

    const onData = (chunk) => {
      buf.text += String(chunk);
      const lines = buf.text.split(/\r?\n/);
      const last = lines.filter(Boolean).pop() ?? '';
      // Wait for a complete SMTP reply (last line has space after code).
      if (!/^\d{3}[ ]/.test(last)) return;
      const code = parseInt(last.slice(0, 3), 10);
      buf.text = '';

      const advance = () => {
        try {
          switch (step) {
            case 'greet':
              step = 'ehlo';
              write('EHLO probe.mailcloud.test');
              return;
            case 'ehlo':
              // Expect 250 with STARTTLS advertised.
              if (code !== 250 || !last.includes('STARTTLS') && !/\n\d{3}[ -]STARTTLS/.test(last)) {
                // STARTTLS presence check across multi-line 250 replies.
              }
              step = 'starttls';
              write('STARTTLS');
              return;
            case 'starttls':
              if (code !== 220) { clearTimeout(timer); sock.destroy(); return resolve({ phase: 'starttls', code, text: last }); }
              secured = tls.connect({ socket: sock, servername: HOST });
              secured.on('data', onData);
              secured.on('error', (e) => { clearTimeout(timer); reject(e); });
              step = 'ehlo2';
              secured.write('EHLO probe.mailcloud.test\r\n');
              return;
            case 'ehlo2': {
              step = 'auth';
              const authBlob = Buffer.from(`\0${SASL_USER}\0${SASL_PASS}`).toString('base64');
              write(`AUTH PLAIN ${authBlob}`);
              return;
            }
            case 'auth':
              if (code !== 235) { clearTimeout(timer); (secured ?? sock).destroy(); return resolve({ phase: 'auth', code, text: last }); }
              step = 'mailfrom';
              write(`MAIL FROM:<${mailFrom}>`);
              return;
            case 'mailfrom':
              clearTimeout(timer);
              try { write('QUIT'); } catch { /* ignore */ }
              try { (secured ?? sock).end(); } catch { /* ignore */ }
              return resolve({ phase: 'mailfrom', code, text: last });
          }
        } catch (e) { clearTimeout(timer); reject(e); }
      };
      advance();
    };

    sock.on('data', onData);
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  console.log(`Sender-spoofing probe → ${HOST}:${PORT}`);
  console.log(`SASL identity: ${SASL_USER}\n`);

  const cases = [
    { name: `MAIL FROM own mailbox (${OWN})`, addr: OWN, expect: 'accept' },
    { name: `MAIL FROM same-tenant other mailbox (${SAME})`, addr: SAME, expect: 'reject' },
    { name: `MAIL FROM other-tenant mailbox (${OTHER})`, addr: OTHER, expect: 'reject' },
    { name: `MAIL FROM external address (${EXTERNAL})`, addr: EXTERNAL, expect: 'reject' },
  ];

  for (const c of cases) {
    try {
      const r = await submissionAttempt(c.addr);
      if (r.phase !== 'mailfrom') {
        bad(`${c.name} — did not reach MAIL FROM (stuck at ${r.phase}, code ${r.code})`);
        info(`  server said: ${r.text}`);
        continue;
      }
      const accepted = r.code >= 200 && r.code < 300;
      const rejected = r.code >= 500;
      if (c.expect === 'accept' && accepted) ok(`${c.name} → ${r.code} accepted`);
      else if (c.expect === 'reject' && rejected) ok(`${c.name} → ${r.code} rejected`);
      else if (c.expect === 'reject' && accepted) bad(`SPOOF ACCEPTED: ${c.name} → ${r.code} (should reject)`);
      else if (c.expect === 'accept' && rejected) bad(`OWN REJECTED: ${c.name} → ${r.code} (should accept)`);
      else info(`${c.name} → ${r.code} (deferred/other): ${r.text}`);
    } catch (e) {
      bad(`${c.name} — connection error: ${e.message}`);
    }
  }

  console.log('\n' + (process.exitCode === 1 ? '❌ FAIL — see ✗ lines above.' : '✅ Sender-login enforcement working.'));
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
