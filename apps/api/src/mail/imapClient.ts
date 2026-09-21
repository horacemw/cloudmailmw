import { ImapFlow } from 'imapflow';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Dovecot supports "master users" — a single credential that can authenticate
 * as any real user, useful for server-side apps that mediate access on behalf
 * of the mailbox owner. We NEVER give the API the user's raw password; the
 * mailbox address is the identity, the master password authorizes the switch.
 *
 * Configure Dovecot with:
 *   auth_master_user_separator = *
 *   passdb { driver = passwd-file; args = /etc/dovecot/master-users; master = yes; }
 *
 * Then the auth username is `<user-addr>*<master-user>` with the master password.
 */

export interface OpenImapOptions {
  mailboxAddress: string;
  /** Optional folder to select. If omitted, only the connection is opened. */
  folder?: string;
  readOnly?: boolean;
}

export async function openImapAsMailbox(opts: OpenImapOptions): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    // ImapFlow issues STARTTLS whenever the server advertises it AND the
    // connection isn't already secure — env flag is retained for future
    // "STARTTLS required" enforcement at the connection-policy layer.
    logger: false,
    auth: {
      user: `${opts.mailboxAddress}*${env.DOVECOT_MASTER_USER}`,
      pass: env.DOVECOT_MASTER_PASSWORD,
    },
    disableAutoIdle: true,
  });

  try {
    await client.connect();
  } catch (err) {
    logger.error({ err, mailbox: opts.mailboxAddress }, 'imap_connect_failed');
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    throw err;
  }

  if (opts.folder) {
    await client.mailboxOpen(opts.folder, { readOnly: opts.readOnly ?? false });
  }
  return client;
}

/** Convenience for a single-use scope. Cleans up regardless of throw. */
export async function withImap<T>(
  opts: OpenImapOptions,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = await openImapAsMailbox(opts);
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}
