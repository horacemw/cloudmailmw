import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { withImap } from '../mail/imapClient.js';
import { loopbackTlsOptions } from '../mail/loopbackTls.js';
import { resolveMailboxForRequest } from '../mail/resolveMailbox.js';
import { prisma } from '../lib/prisma.js';
import { extractCidImages } from '../services/signatureHtml.js';
import { syncMailboxUsage } from '../services/quotaSync.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';
import { scheduleQueue } from '../workers/queue.js';
import { env } from '../config/env.js';
import { errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * These routes are thin proxies over IMAP + SMTP submission. They exist so
 * the browser never speaks IMAP/SMTP directly and so we can add auditing,
 * rate limiting, and per-tenant policy enforcement uniformly.
 */

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── GET /v1/mail/folders ────────────────────────────────────── */
  fastify.get('/folders', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const mb = await resolveMailboxForRequest(req);
      const folders = await withImap({ mailboxAddress: mb.address, readOnly: true }, async (c) => {
        const list = await c.list();
        // For each system role, ImapFlow surfaces the flag in `specialUse`.
        return Promise.all(
          list.map(async (f) => {
            let unread = 0;
            let total = 0;
            try {
              const s = await c.status(f.path, { messages: true, unseen: true });
              total = s.messages ?? 0;
              unread = s.unseen ?? 0;
            } catch {
              /* Some folders (\Noselect) don't support status. */
            }
            return {
              path: f.path,
              name: f.name,
              specialUse: f.specialUse ?? null,
              subscribed: f.subscribed,
              total,
              unread,
            };
          }),
        );
      });
      return { folders };
    },
  });

  /* ─── GET /v1/mail/messages ───────────────────────────────────── */
  fastify.get('/messages', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const q = z
        .object({
          folder: z.string().default('INBOX'),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          before: z.coerce.number().int().positive().optional(), // UID cursor (older than)
          search: z.string().optional(),
        })
        .parse(req.query);

      const mb = await resolveMailboxForRequest(req);
      return withImap({ mailboxAddress: mb.address, folder: q.folder, readOnly: true }, async (c) => {
        // Build a UID search. If the caller supplied `search`, we let Dovecot
        // do the heavy lifting (subject/from/body). No `search` => most recent.
        const criteria = q.search
          ? { or: [{ subject: q.search }, { from: q.search }, { body: q.search }] }
          : { all: true };

        const uidsRaw = await c.search(criteria, { uid: true });
        const uids = Array.isArray(uidsRaw) ? uidsRaw : [];
        if (uids.length === 0) return { messages: [], nextBefore: null };

        // Apply the "before UID" cursor and cap.
        const sorted = uids.filter((u) => (q.before ? u < q.before : true)).sort((a, b) => b - a);
        const page = sorted.slice(0, q.limit);
        if (page.length === 0) return { messages: [], nextBefore: null };

        const messages: Array<{
          uid: number;
          date: Date | null;
          from: { name: string; address: string } | null;
          subject: string;
          preview: string;
          flags: string[];
          hasAttachments: boolean;
          size: number;
        }> = [];

        for await (const msg of c.fetch(
          page.map((u) => `${u}`).join(','),
          { uid: true, envelope: true, bodyStructure: true, flags: true, size: true },
          { uid: true },
        )) {
          const from = msg.envelope?.from?.[0];
          const hasAttachments = flatBodyStructure(msg.bodyStructure).some(
            (p) => p.disposition === 'attachment' || (p.disposition == null && p.type === 'application'),
          );
          messages.push({
            uid: msg.uid,
            date: msg.envelope?.date ?? null,
            from: from ? { name: from.name ?? '', address: from.address ?? '' } : null,
            subject: msg.envelope?.subject ?? '(no subject)',
            preview: '',
            flags: [...(msg.flags ?? [])],
            hasAttachments,
            size: msg.size ?? 0,
          });
        }
        const nextBefore = messages.length === q.limit ? messages[messages.length - 1]!.uid : null;
        return { messages, nextBefore };
      });
    },
  });

  /* ─── GET /v1/mail/messages/:uid ──────────────────────────────── */
  fastify.get('/messages/:uid', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { uid } = z.object({ uid: z.coerce.number().int().positive() }).parse(req.params);
      const q = z.object({ folder: z.string().default('INBOX') }).parse(req.query);
      const mb = await resolveMailboxForRequest(req);
      return withImap({ mailboxAddress: mb.address, folder: q.folder }, async (c) => {
        const fetched = await c.fetchOne(`${uid}`, { source: true, flags: true }, { uid: true });
        if (!fetched || !fetched.source) throw errors.notFound('message_not_found');
        const parsed = await simpleParser(fetched.source);
        // Mark seen once the message body has been served.
        try {
          await c.messageFlagsAdd(`${uid}`, ['\\Seen'], { uid: true });
        } catch {
          /* ignore */
        }
        return {
          uid,
          headers: {
            from: parsed.from?.value ?? [],
            to: parsed.to
              ? Array.isArray(parsed.to)
                ? parsed.to.flatMap((a) => a.value)
                : parsed.to.value
              : [],
            cc: parsed.cc
              ? Array.isArray(parsed.cc)
                ? parsed.cc.flatMap((a) => a.value)
                : parsed.cc.value
              : [],
            date: parsed.date ?? null,
            subject: parsed.subject ?? '',
            messageId: parsed.messageId ?? null,
          },
          html: parsed.html || null,
          text: parsed.text || null,
          attachments: (parsed.attachments ?? []).map((a) => ({
            filename: a.filename ?? 'attachment',
            contentType: a.contentType,
            size: a.size,
            contentId: a.contentId ?? null,
          })),
          flags: [...(fetched.flags ?? [])],
        };
      });
    },
  });

  /* ─── GET /v1/mail/messages/:uid/attachments/:index ──────────
   *  Streams a single parsed attachment straight to the browser.
   *  Scoped through resolveMailboxForRequest so cross-tenant reads
   *  fail with 404. The parsed index is 0-based and MUST match the
   *  order simpleParser returned in /v1/mail/messages/:uid.
   */
  fastify.get('/messages/:uid/attachments/:index', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { uid, index } = z
        .object({
          uid: z.coerce.number().int().positive(),
          index: z.coerce.number().int().min(0).max(50),
        })
        .parse(req.params);
      const q = z.object({ folder: z.string().default('INBOX') }).parse(req.query);
      const mb = await resolveMailboxForRequest(req);
      return withImap({ mailboxAddress: mb.address, folder: q.folder, readOnly: true }, async (c) => {
        const fetched = await c.fetchOne(`${uid}`, { source: true }, { uid: true });
        if (!fetched || !fetched.source) throw errors.notFound('message_not_found');
        const parsed = await simpleParser(fetched.source);
        const att = (parsed.attachments ?? [])[index];
        if (!att) throw errors.notFound('attachment_not_found');
        // Sanitise the filename so Content-Disposition can't be smuggled with CR/LF.
        const safeFilename = (att.filename ?? `attachment-${index}`)
          .replace(/[\r\n"\\]/g, '_')
          .slice(0, 200);
        reply.header('Content-Type', att.contentType || 'application/octet-stream');
        reply.header('Content-Length', att.content.length);
        reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');
        return reply.send(att.content);
      });
    },
  });

  /* ─── GET /v1/mail/messages/:uid/raw ────────────────────────
   *  Full RFC822 source download ("Download original"). Small
   *  message-content window; do not use for bulk export (use the
   *  export job for that).
   */
  fastify.get('/messages/:uid/raw', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { uid } = z.object({ uid: z.coerce.number().int().positive() }).parse(req.params);
      const q = z.object({ folder: z.string().default('INBOX') }).parse(req.query);
      const mb = await resolveMailboxForRequest(req);
      return withImap({ mailboxAddress: mb.address, folder: q.folder, readOnly: true }, async (c) => {
        const fetched = await c.fetchOne(`${uid}`, { source: true }, { uid: true });
        if (!fetched || !fetched.source) throw errors.notFound('message_not_found');
        reply.header('Content-Type', 'message/rfc822');
        reply.header('Content-Disposition', `attachment; filename="message-${uid}.eml"`);
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cache-Control', 'private, no-store');
        return reply.send(fetched.source);
      });
    },
  });

  /* ─── POST /v1/mail/messages/:uid/flags ───────────────────────── */
  fastify.post('/messages/:uid/flags', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { uid } = z.object({ uid: z.coerce.number().int().positive() }).parse(req.params);
      const body = z
        .object({
          folder: z.string().default('INBOX'),
          add: z.array(z.string()).optional(),
          remove: z.array(z.string()).optional(),
        })
        .parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      await withImap({ mailboxAddress: mb.address, folder: body.folder }, async (c) => {
        if (body.add?.length) await c.messageFlagsAdd(`${uid}`, body.add, { uid: true });
        if (body.remove?.length) await c.messageFlagsRemove(`${uid}`, body.remove, { uid: true });
      });
      return { ok: true };
    },
  });

  /* ─── POST /v1/mail/folders  (create) ─────────────────────────── */
  fastify.post('/folders', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z.object({ path: z.string().min(1).max(120) }).parse(req.body);
      // Reject anything that would let an attacker escape the personal namespace.
      if (body.path.includes('..') || body.path.startsWith('/') || body.path.includes('\0')) {
        throw errors.badRequest('invalid_folder_path', 'Folder name is not valid');
      }
      const mb = await resolveMailboxForRequest(req);
      await withImap({ mailboxAddress: mb.address }, async (c) => {
        await c.mailboxCreate(body.path);
      });
      return { ok: true, path: body.path };
    },
  });

  /* ─── DELETE /v1/mail/folders  (remove custom folder) ─────────── */
  fastify.delete('/folders', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z.object({ path: z.string().min(1).max(120) }).parse(req.body);
      // Refuse to delete anything that looks like a system folder.
      const SYSTEM = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive'];
      if (SYSTEM.some((s) => body.path.toLowerCase() === s.toLowerCase())) {
        throw errors.badRequest('cannot_delete_system_folder', `${body.path} is a system folder`);
      }
      const mb = await resolveMailboxForRequest(req);
      await withImap({ mailboxAddress: mb.address }, async (c) => {
        await c.mailboxDelete(body.path);
      });
      return { ok: true };
    },
  });

  /* ─── PATCH /v1/mail/folders  (rename) ────────────────────────── */
  fastify.patch('/folders', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z
        .object({ from: z.string().min(1).max(120), to: z.string().min(1).max(120) })
        .parse(req.body);
      const SYSTEM = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive'];
      if (SYSTEM.some((s) => body.from.toLowerCase() === s.toLowerCase())) {
        throw errors.badRequest('cannot_rename_system_folder', `${body.from} is a system folder`);
      }
      const mb = await resolveMailboxForRequest(req);
      await withImap({ mailboxAddress: mb.address }, async (c) => {
        await c.mailboxRename(body.from, body.to);
      });
      return { ok: true, from: body.from, to: body.to };
    },
  });

  /* ─── POST /v1/mail/messages/:uid/move ────────────────────────── */
  fastify.post('/messages/:uid/move', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { uid } = z.object({ uid: z.coerce.number().int().positive() }).parse(req.params);
      const body = z
        .object({ fromFolder: z.string(), toFolder: z.string() })
        .parse(req.body);
      const mb = await resolveMailboxForRequest(req);
      await withImap({ mailboxAddress: mb.address, folder: body.fromFolder }, async (c) => {
        await c.messageMove(`${uid}`, body.toFolder, { uid: true });
      });
      return { ok: true };
    },
  });

  /* ─── POST /v1/mail/send  (idempotent via header) ─────────────── */
  fastify.post('/send', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (req) => {
      const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.trim();
      const body = z
        .object({
          to: z.array(z.string().email()).min(1),
          cc: z.array(z.string().email()).optional(),
          bcc: z.array(z.string().email()).optional(),
          subject: z.string().max(998).default(''),
          text: z.string().optional(),
          html: z.string().optional(),
          inReplyTo: z.string().optional(),
          references: z.array(z.string()).optional(),
          // Attachments arrive out-of-band via /v1/mail/upload and are referenced by id.
          attachments: z
            .array(z.object({ uploadId: z.string(), filename: z.string() }))
            .optional(),
        })
        .parse(req.body);

      const mb = await resolveMailboxForRequest(req);

      // Basic idempotency using Redis fingerprint. If the same key from the
      // same mailbox is retried within 10 minutes, we return the prior result.
      if (idempotencyKey) {
        const cached = await tryCachedResponse(mb.id, idempotencyKey);
        if (cached) return cached;
      }

      // Real SMTP submission on 587 with STARTTLS, authenticated as the mailbox.
      // The mailbox password is not available here — Dovecot's SASL master
      // trick isn't universally accepted for SMTP AUTH. For now Postfix is
      // configured with `smtpd_sasl_auth_enable = yes` + Dovecot SASL, and the
      // API authenticates using the mailbox master (see infra/postfix/main.cf).
      const transporter = nodemailer.createTransport({
        host: env.SMTP_SUBMISSION_HOST,
        port: env.SMTP_SUBMISSION_PORT,
        secure: env.SMTP_SUBMISSION_SECURE,
        requireTLS: env.SMTP_SUBMISSION_STARTTLS,
        tls: loopbackTlsOptions(env.SMTP_SUBMISSION_HOST),
        auth: {
          user: `${mb.address}*${env.DOVECOT_MASTER_USER}`,
          pass: env.DOVECOT_MASTER_PASSWORD,
        },
      });

      // Resolve any `cid:` references in the HTML body to real files on disk
      // and attach them inline. Only signature images owned by this user
      // are ever inlined — an attacker's HTML can't cause us to attach
      // someone else's file.
      const cidAttachments = body.html
        ? await resolveInlineCidAttachments(body.html, req.currentUser!.id)
        : [];

      const info = await transporter.sendMail({
        from: { name: mb.displayName ?? '', address: mb.address },
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        text: body.text,
        html: body.html,
        inReplyTo: body.inReplyTo,
        references: body.references,
        attachments: cidAttachments,
      });

      logger.info(
        { mailbox: mb.address, messageId: info.messageId, inlineImages: cidAttachments.length },
        'mail_sent',
      );

      // Store the message in Sent by APPENDing back via IMAP.
      // Nodemailer's SentMessageInfo doesn't include the raw RFC822 unless we
      // use streamTransport — so re-render the outgoing mail as a raw buffer.
      try {
        const raw = await buildRawMessage({
          from: { name: mb.displayName ?? '', address: mb.address },
          to: body.to,
          cc: body.cc,
          bcc: body.bcc,
          subject: body.subject,
          text: body.text,
          html: body.html,
          attachments: cidAttachments,
        });
        await withImap({ mailboxAddress: mb.address }, async (c) => {
          const sentFolder = await pickSentFolder(c);
          await c.append(sentFolder, raw, ['\\Seen']);
        });
      } catch (err) {
        logger.warn({ err }, 'failed_to_append_sent');
      }

      const response = { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
      if (idempotencyKey) await cacheResponse(mb.id, idempotencyKey, response);
      // Fire-and-forget quota refresh. Send just APPEND'd to Sent — usage grew.
      void syncMailboxUsage(mb.id);
      return response;
    },
  });

  /* ─── POST /v1/mail/schedule ───────────────────────────────────── */
  fastify.post('/schedule', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (req) => {
      const body = z
        .object({
          to: z.array(z.string().email()).min(1),
          cc: z.array(z.string().email()).optional(),
          bcc: z.array(z.string().email()).optional(),
          subject: z.string().max(998).default(''),
          text: z.string().optional(),
          html: z.string().optional(),
          sendAt: z
            .string()
            .datetime()
            .refine((s) => new Date(s).getTime() > Date.now() + 30_000, {
              message: 'sendAt must be at least 30 s in the future',
            }),
        })
        .parse(req.body);

      const mb = await resolveMailboxForRequest(req);
      const sendAt = new Date(body.sendAt);

      const payload = {
        mailboxId: mb.id,
        from: { name: mb.displayName ?? '', address: mb.address },
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        text: body.text,
        html: body.html,
      };

      const record = await prisma.scheduledMessage.create({
        data: {
          tenantId: mb.tenantId,
          mailboxId: mb.id,
          senderUserId: req.currentUser!.id,
          sendAt,
          payloadCipher: encryptSecret(JSON.stringify(payload)),
        },
      });

      await scheduleQueue.add(
        'send',
        { scheduledMessageId: record.id },
        {
          jobId: `sched-${record.id}`,
          delay: Math.max(0, sendAt.getTime() - Date.now()),
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );

      return {
        id: record.id,
        sendAt: record.sendAt.toISOString(),
        status: record.status,
      };
    },
  });

  /* ─── GET /v1/mail/scheduled ─────────────────────────────────── */
  fastify.get('/scheduled', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const mb = await resolveMailboxForRequest(req);
      const rows = await prisma.scheduledMessage.findMany({
        where: { mailboxId: mb.id, status: { in: ['pending', 'failed'] } },
        orderBy: { sendAt: 'asc' },
        take: 100,
      });
      return {
        scheduled: rows.map((r) => {
          let recipients: string[] = [];
          let subject = '';
          try {
            const p = JSON.parse(decryptSecret(r.payloadCipher)) as { to?: string[]; subject?: string };
            recipients = p.to ?? [];
            subject = p.subject ?? '';
          } catch {
            /* corrupt payload — the worker will mark it failed anyway */
          }
          return {
            id: r.id,
            sendAt: r.sendAt.toISOString(),
            status: r.status,
            recipients,
            subject,
            errorSummary: r.errorSummary,
          };
        }),
      };
    },
  });

  /* ─── DELETE /v1/mail/scheduled/:id — cancel ─────────────────── */
  fastify.delete('/scheduled/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const mb = await resolveMailboxForRequest(req);
      const record = await prisma.scheduledMessage.findFirst({
        where: { id, mailboxId: mb.id },
      });
      if (!record) throw errors.notFound('scheduled_not_found');
      if (record.status !== 'pending')
        throw errors.badRequest('not_pending', `Message is ${record.status}, cannot cancel`);

      await prisma.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'cancelled' },
      });
      try {
        const job = await scheduleQueue.getJob(`sched-${record.id}`);
        if (job) await job.remove();
      } catch (err) {
        logger.warn({ err, id }, 'schedule_cancel_queue_remove_failed');
      }
      reply.code(204);
    },
  });

  /* ─── POST /v1/mail/drafts ───────────────────────────────────── */
  fastify.post('/drafts', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const body = z
        .object({
          to: z.array(z.string()).default([]),
          cc: z.array(z.string()).optional(),
          bcc: z.array(z.string()).optional(),
          subject: z.string().default(''),
          text: z.string().optional(),
          html: z.string().optional(),
          replaceUid: z.number().int().positive().optional(),
        })
        .parse(req.body);

      const mb = await resolveMailboxForRequest(req);
      const raw = await buildRawDraft({ from: mb.address, ...body });

      return withImap({ mailboxAddress: mb.address }, async (c) => {
        const draftsFolder = await pickDraftsFolder(c);
        if (body.replaceUid) {
          try {
            await c.messageDelete(`${body.replaceUid}`, { uid: true });
          } catch {
            /* prior draft may have been deleted elsewhere */
          }
        }
        const appended = await c.append(draftsFolder, raw, ['\\Draft']);
        const uid = appended && typeof appended === 'object' && 'uid' in appended ? appended.uid : null;
        return { uid, folder: draftsFolder };
      });
    },
  });
};

/* ─── helpers ──────────────────────────────────────────────────── */

function flatBodyStructure(node: unknown): Array<{ type: string; disposition: string | null }> {
  const out: Array<{ type: string; disposition: string | null }> = [];
  const walk = (n: any): void => {
    if (!n) return;
    if (Array.isArray(n.childNodes)) {
      for (const child of n.childNodes) walk(child);
    } else {
      out.push({ type: (n.type as string) ?? 'text', disposition: (n.disposition as string) ?? null });
    }
  };
  walk(node);
  return out;
}

const SIGNATURE_STORAGE_ROOT = path.resolve(env.UPLOAD_TMP_DIR, 'signatures');

/**
 * Resolve `<img src="cid:sig-XYZ">` references in outbound HTML to real files
 * on disk. We only inline images that BELONG TO THE CURRENT USER — an
 * attacker who spoofs a cid: reference gets silently ignored (not an error;
 * external clients will just render a broken image, which is safe).
 */
async function resolveInlineCidAttachments(html: string, userId: string): Promise<InlineAttachment[]> {
  const refs = extractCidImages(html);
  if (refs.length === 0) return [];
  const uniqueTokens = [...new Set(refs.map((r) => r.token))];
  const rows = await prisma.signatureImage.findMany({
    where: { cidToken: { in: uniqueTokens }, ownerUserId: userId },
  });
  const out: InlineAttachment[] = [];
  for (const rec of rows) {
    const abs = path.join(SIGNATURE_STORAGE_ROOT, rec.storagePath);
    if (!abs.startsWith(SIGNATURE_STORAGE_ROOT + path.sep)) continue;
    // Read via stream to avoid buffering big files (though we cap at 2 MB anyway).
    void createReadStream; // keep import
    out.push({
      filename: path.basename(rec.storagePath),
      path: abs,
      cid: rec.cidToken,
      contentType: rec.mimeType,
    });
  }
  return out;
}

async function pickSentFolder(c: import('imapflow').ImapFlow): Promise<string> {
  const list = await c.list();
  const sent = list.find((f) => f.specialUse === '\\Sent');
  return sent?.path ?? 'Sent';
}
async function pickDraftsFolder(c: import('imapflow').ImapFlow): Promise<string> {
  const list = await c.list();
  const drafts = list.find((f) => f.specialUse === '\\Drafts');
  return drafts?.path ?? 'Drafts';
}

async function buildRawDraft(opts: {
  from: string;
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
}): Promise<string> {
  return buildRawMessage({ ...opts });
}

interface InlineAttachment {
  filename: string;
  path: string;
  cid: string;
  contentType?: string | undefined;
}

async function buildRawMessage(opts: {
  from: string | { name: string; address: string };
  to: string[];
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
  attachments?: InlineAttachment[] | undefined;
}): Promise<string> {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await transporter.sendMail({
    attachments: opts.attachments,
    from: opts.from,
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
  // With streamTransport+buffer:true, `message` is a Buffer.
  const raw = (info as unknown as { message: Buffer }).message;
  return raw.toString('utf8');
}

async function tryCachedResponse(mailboxId: string, key: string) {
  const { redis } = await import('../lib/redis.js');
  const cached = await redis.get(`send:idem:${mailboxId}:${key}`);
  return cached ? JSON.parse(cached) : null;
}
async function cacheResponse(mailboxId: string, key: string, response: unknown) {
  const { redis } = await import('../lib/redis.js');
  await redis.set(`send:idem:${mailboxId}:${key}`, JSON.stringify(response), 'EX', 600);
}

export default routes;
