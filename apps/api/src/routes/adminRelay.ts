import type { FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requirePlatformAdmin } from './admin.js';

/**
 * Platform-admin view of the outbound SMTP delivery path.
 *
 *   GET  /v1/admin/mail-relay             — current mode + relay hostinfo (never the password)
 *   POST /v1/admin/mail-relay/test        — real TCP + TLS + EHLO probe (no email sent)
 *
 * Only users whose email matches PLATFORM_ADMIN_EMAILS can call these.
 * That envelope is intentionally simple (no separate "super-admin" table
 * yet) so the platform admins are configured out-of-band via env.
 */

const MODE_FILE = '/var/lib/cloudmail/smtp_delivery_mode';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      const mode = await readModeFile();
      const relayHost = process.env.SMTP_RELAY_HOST ?? null;
      const relayPort = process.env.SMTP_RELAY_PORT ?? null;
      const relayEncryption = process.env.SMTP_RELAY_ENCRYPTION ?? 'starttls';
      const usernameMasked = maskUsername(process.env.SMTP_RELAY_USERNAME ?? null);
      return {
        mode,                     // "direct" | "relay"
        relay: {
          host: relayHost,
          port: relayPort ? Number(relayPort) : null,
          encryption: relayEncryption,
          usernameMasked,
          hasPassword: Boolean(process.env.SMTP_RELAY_PASSWORD),
          envelopeFrom: process.env.SMTP_RELAY_ENVELOPE_FROM ?? null,
        },
        instructions: {
          apply:   'bash /opt/cloudmail/current/infra/scripts/50-apply-smtp-relay.sh',
          disable: 'bash /opt/cloudmail/current/infra/scripts/51-disable-smtp-relay.sh',
          envFile: '/etc/cloudmail/deploy.env',
        },
      };
    },
  });

  fastify.post('/test', {
    preHandler: [fastify.requireAuth, requirePlatformAdmin],
    handler: async () => {
      const host = process.env.SMTP_RELAY_HOST;
      const port = Number(process.env.SMTP_RELAY_PORT || 587);
      const enc = process.env.SMTP_RELAY_ENCRYPTION ?? 'starttls';
      if (!host) throw errors.badRequest('relay_not_configured', 'SMTP_RELAY_HOST not set');
      const result = await probeRelay({ host, port, encryption: enc });
      return { host, port, encryption: enc, ...result };
    },
  });
};

async function readModeFile(): Promise<'direct' | 'relay'> {
  try {
    const s = (await fs.readFile(MODE_FILE, 'utf8')).trim();
    return s === 'relay' ? 'relay' : 'direct';
  } catch {
    return 'direct';
  }
}

function maskUsername(u: string | null): string | null {
  if (!u) return null;
  if (u.length <= 4) return '****';
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(4, u.length - 4))}${u.slice(-2)}`;
}

/**
 * Real connection probe: TCP → TLS → SMTP greeting → EHLO → QUIT.
 * We deliberately do NOT send AUTH here — that would need the plaintext
 * password in memory and (worse) potentially in logs on failure. If the
 * TLS + EHLO advertise AUTH we consider the relay reachable.
 */
function probeRelay({
  host, port, encryption,
}: { host: string; port: number; encryption: string }): Promise<{
  ok: boolean;
  tcp: boolean;
  tls: boolean;
  ehlo: boolean;
  authAdvertised: boolean;
  banner: string | null;
  ehloResponse: string | null;
  error?: string;
}> {
  return new Promise((resolve) => {
    const outcome = {
      ok: false, tcp: false, tls: false, ehlo: false, authAdvertised: false,
      banner: null as string | null, ehloResponse: null as string | null,
    };

    const finish = (err?: string) => {
      resolve({ ...outcome, ok: outcome.ehlo && outcome.tls, error: err });
    };

    const wrap = (sock: net.Socket) => {
      let buf = '';
      const send = (line: string) => sock.write(line + '\r\n');
      const timer = setTimeout(() => { try { sock.destroy(); } catch { /* ignore */ } finish('timeout'); }, 8000);
      sock.on('data', (chunk) => {
        buf += String(chunk);
        // Very simple SMTP state machine.
        if (!outcome.banner && /^220[ -]/m.test(buf)) {
          outcome.banner = buf.split('\r\n').find((l) => l.startsWith('220')) ?? null;
          buf = '';
          send('EHLO cloudmail-probe');
          return;
        }
        if (!outcome.ehlo && /^250[ ]/m.test(buf)) {
          outcome.ehlo = true;
          outcome.ehloResponse = buf.trim();
          outcome.authAdvertised = /AUTH\s+.*(PLAIN|LOGIN)/i.test(buf);
          send('QUIT');
          return;
        }
        if (/^221/m.test(buf)) {
          clearTimeout(timer);
          try { sock.end(); } catch { /* ignore */ }
          finish();
        }
      });
      sock.on('error', (err) => { clearTimeout(timer); finish(err.message); });
      sock.on('close', () => { clearTimeout(timer); if (!outcome.ehlo) finish('connection closed'); });
    };

    try {
      if (encryption === 'tls' || encryption === 'smtps') {
        const sock = tls.connect({ host, port, servername: host }, () => {
          outcome.tcp = true; outcome.tls = true;
        });
        wrap(sock as unknown as net.Socket);
      } else {
        // STARTTLS mode: plain TCP → banner → EHLO → STARTTLS → wrap TLS → EHLO
        const sock = net.connect({ host, port }, () => { outcome.tcp = true; });
        let buf = '';
        let starttls = false;
        let secured = false;
        const timer = setTimeout(() => { try { sock.destroy(); } catch { /* ignore */ } finish('timeout'); }, 8000);
        sock.on('data', (chunk) => {
          buf += String(chunk);
          if (!outcome.banner && /^220[ -]/m.test(buf)) {
            outcome.banner = buf.split('\r\n').find((l) => l.startsWith('220')) ?? null;
            buf = '';
            sock.write('EHLO cloudmail-probe\r\n');
            return;
          }
          if (!starttls && /^250[ ]/m.test(buf)) {
            starttls = true;
            outcome.ehloResponse = buf.trim();
            buf = '';
            if (/STARTTLS/i.test(outcome.ehloResponse ?? '')) {
              sock.write('STARTTLS\r\n');
            } else {
              clearTimeout(timer);
              try { sock.end(); } catch { /* ignore */ }
              finish('server does not advertise STARTTLS');
            }
            return;
          }
          if (starttls && !secured && /^220/m.test(buf)) {
            secured = true;
            const s = tls.connect({ socket: sock, servername: host }, () => {
              outcome.tls = true;
              let buf2 = '';
              s.write('EHLO cloudmail-probe\r\n');
              s.on('data', (c) => {
                buf2 += String(c);
                if (!outcome.ehlo && /^250[ ]/m.test(buf2)) {
                  outcome.ehlo = true;
                  outcome.ehloResponse = buf2.trim();
                  outcome.authAdvertised = /AUTH\s+.*(PLAIN|LOGIN)/i.test(buf2);
                  s.write('QUIT\r\n');
                }
                if (/^221/m.test(buf2)) {
                  clearTimeout(timer);
                  try { s.end(); } catch { /* ignore */ }
                  finish();
                }
              });
              s.on('error', (err) => { clearTimeout(timer); finish(err.message); });
            });
          }
        });
        sock.on('error', (err) => { clearTimeout(timer); finish(err.message); });
      }
    } catch (err) {
      logger.warn({ err }, 'relay probe failed');
      finish(err instanceof Error ? err.message : 'probe error');
    }
  });
}

export default routes;
