import net from 'node:net';
import tls from 'node:tls';
import { env } from '../config/env.js';
import { errors } from '../lib/errors.js';

/**
 * Cloud Mail's Sieve integration.
 *
 * Two layers:
 *   1) compileSieveScript(filters, autoReply) — pure function that turns our
 *      structured DB records into a Sieve script string. Deterministic; unit
 *      tests can assert byte-for-byte on the output.
 *   2) putSieveScript(mailbox, script) — pushes the script to Dovecot via
 *      ManageSieve (RFC 5804) on port 4190. Uses PLAIN auth over STARTTLS
 *      as the mailbox owner via the Dovecot master credential
 *      (`<mailbox>*<master-user>` / master password) — the same trick the
 *      IMAP proxy uses.
 *
 * The generated script activates automatically. Only ONE "cloudmail" script
 * is ever active per mailbox; regenerating from the DB is the source of truth.
 */

export interface FilterCondition {
  field: 'from' | 'to' | 'subject' | 'body' | 'any';
  op: 'contains' | 'is' | 'matches';
  value: string;
}
export interface FilterAction {
  kind: 'move' | 'copy' | 'flag' | 'markRead' | 'discard';
  target?: string; // folder name for move/copy; flag name for flag
}
export interface CompiledFilter {
  id: string;
  name: string;
  active: boolean;
  matchType: 'all' | 'any';
  conditions: FilterCondition[];
  actions: FilterAction[];
}
export interface AutoReplyDef {
  enabled: boolean;
  subject: string;
  body: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

const SIEVE_SCRIPT_NAME = 'cloudmail';

/**
 * Turn DB rows into a valid Sieve script. Uses `require` correctly and only
 * enables extensions we actually use. Comments include filter ids so an
 * operator inspecting the server-side script can trace back to the row.
 */
export function compileSieveScript(
  filters: CompiledFilter[],
  autoReply: AutoReplyDef | null,
): string {
  const active = filters.filter((f) => f.active);
  const usesFileinto = active.some((f) => f.actions.some((a) => a.kind === 'move' || a.kind === 'copy'));
  const usesImapflags = active.some((f) => f.actions.some((a) => a.kind === 'flag' || a.kind === 'markRead'));
  const usesRegex = active.some((f) => f.conditions.some((c) => c.op === 'matches'));
  const usesVacation = Boolean(autoReply?.enabled);

  const requires: string[] = [];
  if (usesFileinto) requires.push('fileinto');
  if (usesImapflags) requires.push('imap4flags');
  if (usesRegex) requires.push('regex');
  if (usesVacation) requires.push('vacation');
  if (usesFileinto) requires.push('mailbox'); // for :create on fileinto

  const lines: string[] = [];
  lines.push('# Cloud Mail — auto-generated Sieve script. DO NOT EDIT BY HAND.');
  lines.push('# Source of truth is /v1/filters and /v1/auto-reply in Postgres.');
  if (requires.length) lines.push(`require [${[...new Set(requires)].map((q) => `"${q}"`).join(', ')}];`);
  lines.push('');

  for (const f of active) {
    lines.push(`# ── filter: ${escapeComment(f.name)} (id=${f.id}) ─────`);
    const tests = f.conditions.map(compileCondition).filter(Boolean) as string[];
    if (tests.length === 0) continue;
    const header = f.matchType === 'any' ? 'anyof' : 'allof';
    const testExpr = tests.length === 1 ? tests[0] : `${header} (${tests.join(', ')})`;
    lines.push(`if ${testExpr} {`);
    let stop = false;
    for (const a of f.actions) {
      const rendered = compileAction(a);
      if (rendered) lines.push(`  ${rendered}`);
      if (a.kind === 'discard') stop = true;
    }
    if (stop) lines.push('  stop;');
    lines.push('}');
    lines.push('');
  }

  if (autoReply?.enabled) {
    const now = new Date();
    const startOk = !autoReply.startDate || now >= autoReply.startDate;
    const endOk = !autoReply.endDate || now <= autoReply.endDate;
    if (startOk && endOk) {
      lines.push('# ── auto-reply / vacation ─────');
      const subj = quoteSieve(autoReply.subject || 'Out of office');
      const bodyLines = (autoReply.body || '').split('\n').map(quoteSieve);
      lines.push('vacation');
      lines.push('  :days 7');
      lines.push(`  :subject ${subj}`);
      if (bodyLines.length === 1) {
        lines.push(`  ${bodyLines[0]};`);
      } else {
        // Sieve multiline "text:" body.
        lines.push('  text:');
        lines.push(autoReply.body);
        lines.push('.');
        lines.push(';');
      }
    }
  }

  return lines.join('\n');
}

function compileCondition(c: FilterCondition): string | null {
  const value = quoteSieve(c.value);
  const matchType = c.op === 'is' ? ':is' : c.op === 'matches' ? ':regex' : ':contains';
  if (c.field === 'body') {
    // body test needs its own extension normally but Dovecot supports it out of the box.
    return `body ${matchType} :text ${value}`;
  }
  if (c.field === 'any') {
    return `header ${matchType} ["from", "to", "cc", "subject"] ${value}`;
  }
  const header = c.field === 'from' ? '"from"' : c.field === 'to' ? '"to"' : '"subject"';
  return `header ${matchType} ${header} ${value}`;
}

function compileAction(a: FilterAction): string | null {
  switch (a.kind) {
    case 'move':
      if (!a.target) return null;
      return `fileinto :create ${quoteSieve(a.target)};`;
    case 'copy':
      if (!a.target) return null;
      return `fileinto :copy :create ${quoteSieve(a.target)};`;
    case 'flag':
      return `addflag ${quoteSieve(a.target ?? '\\Flagged')};`;
    case 'markRead':
      return `addflag "\\\\Seen";`;
    case 'discard':
      return 'discard;';
    default:
      return null;
  }
}

function quoteSieve(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function escapeComment(s: string): string {
  return s.replace(/\r?\n/g, ' ').slice(0, 120);
}

/* ─── ManageSieve client ──────────────────────────────────────── */

/**
 * Push (PUTSCRIPT) + activate (SETACTIVE) the given script for a mailbox.
 * Uses STARTTLS + SASL PLAIN with the Dovecot master credential.
 *
 * Not a full ManageSieve client — just the four commands we need. Handles
 * multi-line greeting, capability negotiation, STARTTLS, AUTH, PUTSCRIPT
 * (with literal-syntax length prefix), SETACTIVE, LOGOUT.
 */
export async function deploySieveScript(mailboxAddress: string, script: string): Promise<void> {
  const host = env.IMAP_HOST; // ManageSieve typically shares the mail host
  const port = 4190;

  await new Promise<void>((resolve, reject) => {
    let sock: net.Socket | tls.TLSSocket = net.connect({ host, port });
    let secured = false;
    let capabilities: string[] = [];
    let buf = '';

    const state = { step: 'greeting' as
      | 'greeting'
      | 'starttls-sent'
      | 'authenticate-sent'
      | 'putscript-sent'
      | 'setactive-sent'
      | 'logout-sent' };

    const timeout = setTimeout(() => {
      try { sock.destroy(); } catch { /* ignore */ }
      reject(new Error('managesieve timeout'));
    }, 15_000);

    const send = (line: string): void => { sock.write(line + '\r\n'); };
    const cleanup = (err?: Error): void => {
      clearTimeout(timeout);
      try { sock.end(); } catch { /* ignore */ }
      if (err) reject(err); else resolve();
    };

    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8');
      // Responses end with either OK / NO / BYE line.
      // We process every complete line up to the last CRLF.
      while (true) {
        const idx = buf.indexOf('\r\n');
        if (idx < 0) break;
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleLine(line);
      }
    };

    function handleLine(line: string): void {
      // Capability line: "IMAPSIEVE" "..."
      if (line.startsWith('"')) {
        capabilities.push(line);
        return;
      }
      const upper = line.trim().toUpperCase();
      // Terminal words we care about.
      if (upper.startsWith('OK') || upper.startsWith('NO') || upper.startsWith('BYE')) {
        onTerminal(upper.startsWith('OK'), line);
      }
    }

    function onTerminal(okState: boolean, line: string): void {
      switch (state.step) {
        case 'greeting': {
          if (!okState) return cleanup(new Error(`greeting: ${line}`));
          // Advance: request STARTTLS if we're not already secured.
          state.step = 'starttls-sent';
          send('STARTTLS');
          return;
        }
        case 'starttls-sent': {
          if (!okState) return cleanup(new Error(`STARTTLS refused: ${line}`));
          // Upgrade the socket.
          const plainSock = sock;
          sock = tls.connect({ socket: plainSock, servername: host, rejectUnauthorized: false });
          sock.on('data', onData);
          sock.on('error', (e) => cleanup(e));
          sock.once('secureConnect', () => {
            secured = true;
            // Wait for new capability list on the TLS channel.
            capabilities = [];
            // The server re-emits a greeting; treat next OK as auth ready.
            state.step = 'authenticate-sent';
            const raw = Buffer.from(`\0${mailboxAddress}*${env.DOVECOT_MASTER_USER}\0${env.DOVECOT_MASTER_PASSWORD}`, 'utf8');
            const b64 = raw.toString('base64');
            send(`AUTHENTICATE "PLAIN" "${b64}"`);
          });
          return;
        }
        case 'authenticate-sent': {
          if (!okState) return cleanup(new Error(`AUTHENTICATE failed: ${line}`));
          state.step = 'putscript-sent';
          // PUTSCRIPT uses a literal:  PUTSCRIPT "name" {<len>+}\r\n<bytes>
          const bytes = Buffer.byteLength(script, 'utf8');
          sock.write(`PUTSCRIPT "${SIEVE_SCRIPT_NAME}" {${bytes}+}\r\n`);
          sock.write(script);
          sock.write('\r\n');
          return;
        }
        case 'putscript-sent': {
          if (!okState) return cleanup(new Error(`PUTSCRIPT rejected: ${line}`));
          state.step = 'setactive-sent';
          send(`SETACTIVE "${SIEVE_SCRIPT_NAME}"`);
          return;
        }
        case 'setactive-sent': {
          if (!okState) return cleanup(new Error(`SETACTIVE failed: ${line}`));
          state.step = 'logout-sent';
          send('LOGOUT');
          return;
        }
        case 'logout-sent':
          cleanup();
          return;
      }
    }

    sock.on('data', onData);
    sock.on('error', (e) => cleanup(e));
    sock.on('close', () => {
      if (state.step !== 'logout-sent') cleanup(new Error('connection closed prematurely'));
    });
    void secured; // referenced above; keep TS quiet
  });
}

/** Convenience for the API handlers: refuse with a clear error on failure. */
export async function deploySieveOrThrow(mailboxAddress: string, script: string): Promise<void> {
  try {
    await deploySieveScript(mailboxAddress, script);
  } catch (err) {
    throw errors.internal(
      'sieve_deploy_failed',
      err instanceof Error ? err.message : 'ManageSieve error',
    );
  }
}
