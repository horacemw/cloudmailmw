import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { errors } from '../lib/errors.js';
import { shortId } from '../lib/ids.js';
import { sanitizeSignatureHtml } from '../services/signatureHtml.js';

/**
 * Signatures API.
 *
 *   GET    /v1/signatures
 *   POST   /v1/signatures                  { name, html, isDefault? }
 *   PATCH  /v1/signatures/:id              { name?, html?, isDefault? }
 *   DELETE /v1/signatures/:id
 *
 *   POST   /v1/signatures/images           multipart file (jpeg/png/gif/webp, ≤ 2 MB)
 *          → { cid, url, mimeType, sizeBytes }
 *   GET    /v1/signatures/images/:cid      binary (owner-only, no cross-user reads)
 *
 * All HTML runs through sanitizeSignatureHtml() BEFORE persistence. External
 * URLs in <img> are refused — only cid: refs to images uploaded here.
 */

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per image
const STORAGE_ROOT = path.resolve(env.UPLOAD_TMP_DIR, 'signatures');

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.signature.findMany({
        where: { ownerUserId: req.currentUser!.id, tenantId: req.currentTenant!.id },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      return {
        signatures: rows.map((r) => ({
          id: r.id,
          name: r.name,
          html: r.html,
          isDefault: r.isDefault,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      };
    },
  });

  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(80),
          html: z.string().max(50_000).default(''),
          isDefault: z.boolean().optional(),
        })
        .parse(req.body);
      const html = sanitizeSignatureHtml(body.html);

      if (body.isDefault) {
        await prisma.signature.updateMany({
          where: { ownerUserId: req.currentUser!.id },
          data: { isDefault: false },
        });
      }
      const s = await prisma.signature.create({
        data: {
          tenantId: req.currentTenant!.id,
          ownerUserId: req.currentUser!.id,
          name: body.name,
          html,
          isDefault: Boolean(body.isDefault),
        },
      });
      reply.code(201);
      return { id: s.id, name: s.name, html: s.html, isDefault: s.isDefault };
    },
  });

  fastify.patch('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(80).optional(),
          html: z.string().max(50_000).optional(),
          isDefault: z.boolean().optional(),
        })
        .parse(req.body);
      const existing = await loadOwnSig(req, id);
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.html !== undefined) patch.html = sanitizeSignatureHtml(body.html);
      if (body.isDefault) {
        await prisma.signature.updateMany({
          where: { ownerUserId: req.currentUser!.id },
          data: { isDefault: false },
        });
        patch.isDefault = true;
      } else if (body.isDefault === false) {
        patch.isDefault = false;
      }
      const s = await prisma.signature.update({ where: { id: existing.id }, data: patch });
      return { id: s.id, name: s.name, html: s.html, isDefault: s.isDefault };
    },
  });

  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const existing = await loadOwnSig(req, id);
      await prisma.signature.delete({ where: { id: existing.id } });
      reply.code(204);
    },
  });

  /* ─── Image upload ───────────────────────────────────────────── */

  fastify.post('/images', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const file = await req.file();
      if (!file) throw errors.badRequest('no_file', 'Upload a file field named "file"');
      const mime = (file.mimetype || '').toLowerCase();
      if (!ALLOWED_IMAGE_MIMES.has(mime))
        throw errors.badRequest('bad_mime', `Only PNG/JPEG/GIF/WebP allowed (got ${mime})`);

      // Stream to disk with a hard size cap.
      const userDir = path.join(STORAGE_ROOT, req.currentUser!.id);
      await fs.mkdir(userDir, { recursive: true, mode: 0o700 });
      const ext = extForMime(mime);
      const id = shortId();
      const cidToken = `sig-${shortId()}`;
      const storagePath = path.join(userDir, `${id}${ext}`);

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of file.file) {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) {
          throw errors.badRequest('too_large', `Image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
        }
        chunks.push(chunk);
      }
      // Trailing @fastify/multipart "truncated" flag catches header-hinted overflows.
      if (file.file.truncated)
        throw errors.badRequest('too_large', `Image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);

      await fs.writeFile(storagePath, Buffer.concat(chunks), { mode: 0o600 });

      const record = await prisma.signatureImage.create({
        data: {
          id,
          ownerUserId: req.currentUser!.id,
          cidToken,
          mimeType: mime,
          sizeBytes: total,
          storagePath: path.relative(STORAGE_ROOT, storagePath),
        },
      });

      reply.code(201);
      return {
        id: record.id,
        cid: cidToken,
        cidRef: `cid:${cidToken}`,
        url: `/v1/signatures/images/${cidToken}`,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
      };
    },
  });

  fastify.get('/images/:cid', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const { cid } = z.object({ cid: z.string().min(4).max(80) }).parse(req.params);
      const rec = await prisma.signatureImage.findUnique({ where: { cidToken: cid } });
      if (!rec || rec.ownerUserId !== req.currentUser!.id) throw errors.notFound('image_not_found');
      const abs = path.join(STORAGE_ROOT, rec.storagePath);
      // Ensure the resolved path is still inside STORAGE_ROOT (defence in depth
      // against a manipulated Prisma row).
      if (!abs.startsWith(STORAGE_ROOT + path.sep)) throw errors.notFound('image_not_found');
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) throw errors.notFound('image_missing_on_disk');
      reply
        .header('content-type', rec.mimeType)
        .header('content-length', String(stat.size))
        .header('cache-control', 'private, max-age=3600')
        .header('x-content-type-options', 'nosniff');
      return reply.send(createReadStream(abs));
    },
  });
};

async function loadOwnSig(req: FastifyRequest, id: string) {
  const s = await prisma.signature.findFirst({
    where: {
      id,
      ownerUserId: req.currentUser!.id,
      tenantId: req.currentTenant!.id,
    },
  });
  if (!s) throw errors.notFound('signature_not_found');
  return s;
}

function extForMime(mime: string): string {
  switch (mime) {
    case 'image/png': return '.png';
    case 'image/jpeg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'image/webp': return '.webp';
    default: return '.bin';
  }
}

// Fastify type-widening for the reply type (avoid an unused import).
void ({} as FastifyReply);

export default routes;
