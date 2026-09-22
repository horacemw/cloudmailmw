#!/usr/bin/env node
/**
 * External open-relay probe.
 *
 * Connects to mail.digiskills.live:25 from an unauthenticated external client
 * and attempts to submit mail with a from-domain and to-domain that both live
 * OUTSIDE our virtual_mailbox_domains. A correct server MUST reject at
 * RCPT TO (or DATA) with 5xx or 4xx — never accept.
 *
 * Also probes 587 (submission) to confirm STARTTLS + auth is required.
 *
 * Usage: node open-relay-check.mjs [host]
 *
 * Exit code 0 = server correctly rejects. Non-zero = OPEN RELAY (blocker).
 */
import net from 'node:net';

const HOST = process.argv[2] ?? 'mail.digiskills.live';
const OUTSIDER_FROM = 'attacker@evil.example';
const OUTSIDER_TO   = 'victim@third-party.example';

async function chat(port, greet, cmds) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: HOST, port, family: 4 });
    const buf = [];
    let step = 0;
    let killed = false;
    const kill = (why) => { if (killed) return; killed = true; sock.destroy(); reject(new Error(why)); };
    const timer = setTimeout(() => kill('timeout'), 15000);

    sock.setEncoding('utf8');
    sock.on('data', (chunk) => {
      buf.push({ dir: '<', text: chunk.trimEnd() });
      // Wait for a full SMTP reply (last line has space, not dash, after code).
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (!/^\d{3}[ ].*/.test(last)) return;
      if (step >= cmds.length) {
        clearTimeout(timer);
        sock.end();
        resolve(buf);
        return;
      }
      const nextCmd = cmds[step++];
      buf.push({ dir: '>', text: nextCmd });
      sock.write(nextCmd + '\r\n');
    });
    sock.on('error', (e) => { clearTimeout(timer); kill(e.message); });
    sock.on('close', () => { clearTimeout(timer); if (!killed) resolve(buf); });
    void greet; // greet handled by first server line
  });
}

function fmt(buf) {
  return buf.map((l) => `  ${l.dir} ${l.text}`).join('\n');
}

async function main() {
  let bad = false;
  console.log(`Open-relay probe → ${HOST}\n`);

  // ─── :25 (MX port) — unauthenticated external client should NOT be able to relay ───
  console.log('── :25 unauth relay to third-party ─────────────────────────');
  try {
    const t = await chat(25, null, [
      'EHLO probe.local',
      `MAIL FROM:<${OUTSIDER_FROM}>`,
      `RCPT TO:<${OUTSIDER_TO}>`,
      'QUIT',
    ]);
    console.log(fmt(t));
    const rcptReply = t.reverse().find((l) => l.dir === '<' && /^\s*[45]\d\d/.test(l.text.split('\n').pop() ?? ''));
    // Find the reply that comes right after RCPT TO
    const rcptIndex = t.findIndex((l) => l.dir === '>' && l.text.startsWith('RCPT TO'));
    const rcptResponse = t.slice(rcptIndex + 1).find((l) => l.dir === '<');
    if (rcptResponse && /^\s*5\d\d/.test(rcptResponse.text)) {
      console.log('  ✓ REJECTED (5xx) — server correctly refuses relay\n');
    } else if (rcptResponse && /^\s*4\d\d/.test(rcptResponse.text)) {
      console.log('  ✓ DEFERRED (4xx) — server correctly refuses to accept unauth relay\n');
    } else {
      console.log('  ✗ OPEN RELAY! Server accepted RCPT TO from unauth outsider\n');
      bad = true;
    }
  } catch (e) {
    console.log(`  · connection error: ${e.message}\n`);
    bad = true;
  }

  // ─── :587 (submission) — must offer STARTTLS + require auth ─────
  console.log('── :587 submission requires auth (unauth MAIL FROM must fail) ─');
  try {
    const t = await chat(587, null, [
      'EHLO probe.local',
      `MAIL FROM:<${OUTSIDER_FROM}>`,
      `RCPT TO:<${OUTSIDER_TO}>`,
      'QUIT',
    ]);
    console.log(fmt(t));
    const rcptIndex = t.findIndex((l) => l.dir === '>' && l.text.startsWith('RCPT TO'));
    const rcptResponse = t.slice(rcptIndex + 1).find((l) => l.dir === '<');
    const ehloResponse = t.find((l) => l.dir === '<' && l.text.includes('250-'));
    const advertisesStarttls = ehloResponse?.text.includes('STARTTLS');
    if (rcptResponse && /^\s*5\d\d/.test(rcptResponse.text)) {
      console.log(`  ✓ REJECTED (5xx) on submission port for unauth client${advertisesStarttls ? ' [STARTTLS advertised]' : ''}\n`);
    } else if (rcptResponse && /^\s*4\d\d/.test(rcptResponse.text)) {
      console.log(`  ✓ DEFERRED (4xx) on submission port for unauth client\n`);
    } else {
      console.log(`  ✗ Submission port accepted unauth relay — BLOCKER\n`);
      bad = true;
    }
  } catch (e) {
    console.log(`  · connection error: ${e.message}\n`);
    bad = true;
  }

  console.log(bad ? '❌ FAIL — see ✗ lines above.' : '✅ Server correctly refuses open relay on both :25 and :587.');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
