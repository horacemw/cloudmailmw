#!/usr/bin/env node
/**
 * deliverability-probe.mjs — send one probe message from a real mailbox to
 * a mail-tester.com address, then print the results URL so the operator
 * can open it in a browser and read the score.
 *
 * Usage (on the deployed API root, sourcing api.env):
 *   node scripts/deliverability-probe.mjs <sender-mailbox-address>
 *
 * The script prompts for the mail-tester recipient (a random address you
 * grab from https://www.mail-tester.com/). It uses the API's Dovecot master
 * credential to authenticate to SMTP submission on 127.0.0.1:587 — same
 * path as production /v1/mail/send — so what mail-tester scores is exactly
 * what your customers' recipients see.
 *
 * Nothing about this script talks to a database, opens a browser, or
 * exposes secrets. Read-only from the DB's perspective, one send that
 * mail-tester itself is designed to receive.
 */

import nodemailer from 'nodemailer';
import readline from 'node:readline';

const SENDER = process.argv[2];
if (!SENDER) {
  console.error('usage: node scripts/deliverability-probe.mjs <sender-mailbox-address>');
  console.error('example: node scripts/deliverability-probe.mjs info@njingatracker.online');
  process.exit(1);
}

// Fail fast if we don't have the vars we need — better than a mystery
// SMTP AUTH error 30 seconds later.
for (const v of ['DOVECOT_MASTER_USER', 'DOVECOT_MASTER_PASSWORD', 'CLOUDMAIL_INITIAL_MAIL_HOST']) {
  if (!process.env[v]) {
    console.error(`ERROR: ${v} is not set. Source /etc/cloudmail/api.env first.`);
    process.exit(1);
  }
}

// Interactive prompt for the mail-tester recipient.
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

const recipient = await prompt(
  'Paste the mail-tester recipient address from https://www.mail-tester.com/\n' +
  '(looks like test-abc123@srv1.mail-tester.com): ',
);
if (!/^test-[a-z0-9]+@srv1?\.mail-tester\.com$/i.test(recipient)) {
  console.error(`ERROR: '${recipient}' does not look like a mail-tester address.`);
  console.error('Expected format: test-<random>@srv1.mail-tester.com');
  process.exit(1);
}

const tx = nodemailer.createTransport({
  host: '127.0.0.1',
  port: 587,
  secure: false,
  requireTLS: true,
  tls: { servername: process.env.CLOUDMAIL_INITIAL_MAIL_HOST },
  auth: {
    user: `${SENDER}*${process.env.DOVECOT_MASTER_USER}`,
    pass: process.env.DOVECOT_MASTER_PASSWORD,
  },
});

console.error(`\nSending probe from ${SENDER} → ${recipient} ...`);

try {
  const info = await tx.sendMail({
    from: SENDER,
    to: recipient,
    subject: `MailCloud deliverability probe · ${new Date().toISOString()}`,
    text:
      'Hello,\n\n' +
      'This is a routine deliverability probe from a MailCloud instance.\n' +
      'It has plain-text-only body, no attachments, no images, no links.\n' +
      'Scoring should reflect the identity layer (SPF, DKIM, DMARC, rDNS)\n' +
      'and not be pulled down by content-based signals.\n\n' +
      'Sender: ' + SENDER + '\n' +
      'Sent at: ' + new Date().toISOString() + '\n\n' +
      '— cloudmail operator probe\n',
    headers: {
      'X-MailCloud-Probe': 'deliverability',
      'List-Unsubscribe': `<mailto:unsubscribe@${SENDER.split('@')[1]}>`,
    },
  });
  console.error(`  sent — messageId=${info.messageId}`);
} catch (err) {
  console.error(`  send FAILED: ${err?.message ?? err}`);
  process.exit(2);
}

// mail-tester URL is derived from the recipient's local-part.
const uid = recipient.split('@')[0]; // "test-abc123"
const resultsUrl = `https://www.mail-tester.com/${uid}`;

console.error('\n───────────────────────────────────────────────────────────');
console.error('  PROBE DELIVERED. Wait ~30 seconds, then open:');
console.error('  ' + resultsUrl);
console.error('───────────────────────────────────────────────────────────');
console.error('Target: 9/10 or better. Anything less is an identity');
console.error('problem, not a warm-up problem — see docs/deliverability.md');

// One-line stdout for shell composition.
process.stdout.write(resultsUrl + '\n');
process.exit(0);
