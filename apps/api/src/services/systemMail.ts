import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * System mail sender.
 *
 * For transactional messages that don't originate from a real mailbox
 * (password reset, welcome, quota-exceeded alerts). Submits via the loopback
 * Postfix instance on port 25 with no auth — Postfix's `mynetworks =
 * 127.0.0.0/8` permits unauthenticated local relay.
 *
 * The From address defaults to no-reply@<initial-mail-host>. That domain
 * has DKIM + SPF + DMARC already published (it's the server's own hostname).
 */

let cachedTransport: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 25,
    secure: false,
    ignoreTLS: true, // localhost, no TLS advertised on 25
    // NB: no auth — Postfix trusts loopback.
  });
  return cachedTransport;
}

export interface SystemMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export async function sendSystemMail(input: SystemMailInput): Promise<void> {
  const fromDomain = env.CLOUDMAIL_INITIAL_MAIL_HOST ?? 'mail.digiskills.live';
  const from = `Cloud Mail <no-reply@${fromDomain}>`;
  try {
    const info = await transport().sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    logger.info(
      { to: input.to, subject: input.subject, messageId: info.messageId },
      'system_mail_sent',
    );
  } catch (err) {
    logger.warn({ err, to: input.to, subject: input.subject }, 'system_mail_failed');
    // Never throw — the calling code path (password reset, notifications) must
    // not fail just because the mail server is momentarily unavailable.
  }
}
