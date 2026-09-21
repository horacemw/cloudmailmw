import nodemailer from 'nodemailer';
import { withImap } from '../mail/imapClient.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { syncMailboxUsage } from './quotaSync.js';

/**
 * Shared "actually send" path used by:
 *  - POST /v1/mail/send        (immediate)
 *  - workers/scheduleWorker    (deferred)
 *
 * Authenticates to Postfix on 587/STARTTLS as `<mailbox>*<master>` with the
 * Dovecot master password; on success APPENDs the outgoing message into the
 * mailbox's Sent folder over IMAP so the user sees it there.
 */

export interface OutgoingMessage {
  mailboxId: string;
  from: { name: string; address: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{ filename: string; path?: string; content?: Buffer; cid?: string; contentType?: string }>;
}

export interface SendResult {
  messageId: string | undefined;
  accepted: unknown;
  rejected: unknown;
}

export async function performSend(msg: OutgoingMessage): Promise<SendResult> {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_SUBMISSION_HOST,
    port: env.SMTP_SUBMISSION_PORT,
    secure: env.SMTP_SUBMISSION_SECURE,
    requireTLS: env.SMTP_SUBMISSION_STARTTLS,
    auth: {
      user: `${msg.from.address}*${env.DOVECOT_MASTER_USER}`,
      pass: env.DOVECOT_MASTER_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: msg.from,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    inReplyTo: msg.inReplyTo,
    references: msg.references,
    attachments: msg.attachments,
  });
  logger.info(
    { mailbox: msg.from.address, messageId: info.messageId },
    'mail_sent',
  );

  // APPEND to Sent so the sender sees the message there.
  try {
    const raw = await buildRawMessage(msg);
    await withImap({ mailboxAddress: msg.from.address }, async (c) => {
      const list = await c.list();
      const sent = list.find((f) => f.specialUse === '\\Sent');
      const folder = sent?.path ?? 'Sent';
      await c.append(folder, raw, ['\\Seen']);
    });
  } catch (err) {
    logger.warn({ err }, 'failed_to_append_sent');
  }

  // Refresh usage — Sent APPEND grew the mailbox.
  void syncMailboxUsage(msg.mailboxId);

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

async function buildRawMessage(msg: OutgoingMessage): Promise<Buffer> {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await transporter.sendMail({
    from: msg.from,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: msg.attachments,
  });
  return (info as unknown as { message: Buffer }).message;
}
