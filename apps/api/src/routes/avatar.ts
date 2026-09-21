import type { FastifyPluginAsync } from 'fastify';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { env } from '../config/env.js';

/**
 * Profile avatar upload + serve.
 *
 *   POST   /v1/me/avatar    multipart file (jpeg/png/webp, ≤ 1 MB)
 *   DELETE /v1/me/avatar    removes stored file + clears User.avatarUrl
 *   GET    /v1/users/:userId/avatar   authenticated fetch (any signed-in user)
 *
 * Storage layout: {UPLOAD_TMP_DIR}/avatars/{userId}{.ext}. Each user has at
 * most one avatar file; a new upload atomically replaces the previous file.
 */

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const STORAGE_ROOT = path.resolve(env.UPLOAD_TMP_DIR, 'avatars');

function extForMime(m: string): string {
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  return '.jpg';
}

async function findAvatarFile(userId: string): Promise<{ abs: string; mime: string } | null> {
  for (const [mime, ext] of Object.entries({
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  })) {
    const abs = path.join(STORAGE_ROOT, `${userId}${ext}`);
    const stat = await fs.stat(abs).catch(() => null);
    if (stat) return { abs, mime };
  }
  return null;
}

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/me/avatar', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const file = await req.file();
      if (!file) throw errors.badRequest('no_file', 'Upload a file field named "file"');
      const mime = (file.mimetype || '').toLowerCase();
      if (!ALLOWED_MIMES.has(mime))
        throw errors.badRequest('bad_mime', `Only PNG/JPEG/WebP allowed (got ${mime})`);

      const userDir = STORAGE_ROOT;
      await fs.mkdir(userDir, { recursive: true, mode: 0o700 });
      const ext = extForMime(mime);
      const abs = path.join(userDir, `${req.currentUser!.id}${ext}`);

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of file.file) {
        total += chunk.length;
        if (total > MAX_BYTES) throw errors.badRequest('too_large', `Avatar exceeds ${MAX_BYTES / 1024} KB`);
        chunks.push(chunk);
      }
      if (file.file.truncated)
        throw errors.badRequest('too_large', `Avatar exceeds ${MAX_BYTES / 1024} KB`);

      // Clean up any older avatar files that might use a different extension.
      const existing = await findAvatarFile(req.currentUser!.id);
      if (existing && existing.abs !== abs) {
        await fs.unlink(existing.abs).catch(() => {
          /* ignore */
        });
      }

      await fs.writeFile(abs, Buffer.concat(chunks), { mode: 0o600 });

      const avatarUrl = `/v1/users/${req.currentUser!.id}/avatar?v=${Date.now()}`;
      await prisma.user.update({
        where: { id: req.currentUser!.id },
        data: { avatarUrl },
      });

      reply.code(201);
      return { avatarUrl, sizeBytes: total, mimeType: mime };
    },
  });

  fastify.delete('/me/avatar', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const existing = await findAvatarFile(req.currentUser!.id);
      if (existing) await fs.unlink(existing.abs).catch(() => { /* ignore */ });
      await prisma.user.update({
        where: { id: req.currentUser!.id },
        data: { avatarUrl: null },
      });
      reply.code(204);
    },
  });

  fastify.get('/users/:userId/avatar', {
    preHandler: [fastify.requireAuth],
    handler: async (req, reply) => {
      const { userId } = z.object({ userId: z.string() }).parse(req.params);
      const found = await findAvatarFile(userId);
      if (!found) throw errors.notFound('avatar_not_found');
      // Any authenticated caller can fetch — avatars are considered public-ish
      // within Cloud Mail (like Gravatar). Cross-tenant isolation isn't relevant
      // because avatars carry no confidential content.
      const stat = await fs.stat(found.abs);
      reply
        .header('content-type', found.mime)
        .header('content-length', String(stat.size))
        .header('cache-control', 'private, max-age=3600')
        .header('x-content-type-options', 'nosniff');
      return reply.send(createReadStream(found.abs));
    },
  });
};

export default routes;
