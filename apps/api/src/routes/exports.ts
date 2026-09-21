import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { env } from '../config/env.js';
import { exportQueue } from '../workers/queue.js';

const EXPORT_DIR = path.resolve(env.UPLOAD_TMP_DIR, 'exports');

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const body = z
        .object({
          mailboxId: z.string(),
          format: z.enum(['mbox', 'eml_zip']).default('mbox'),
          scope: z.enum(['full', 'folder']).default('full'),
          folder: z.string().optional(),
        })
        .parse(req.body);

      const mailbox = await prisma.mailbox.findFirst({
        where: { id: body.mailboxId, tenantId: req.currentTenant!.id },
      });
      if (!mailbox) throw errors.notFound('mailbox_not_found');
      if (body.scope === 'folder' && !body.folder)
        throw errors.badRequest('folder_required', 'A folder is required when scope is "folder"');

      const job = await prisma.exportJob.create({
        data: {
          tenantId: req.currentTenant!.id,
          mailboxId: mailbox.id,
          format: body.format,
          scope: body.scope,
          scopeFolder: body.folder ?? null,
        },
      });
      await exportQueue.add(
        'export',
        { jobId: job.id },
        { attempts: 2, backoff: { type: 'exponential', delay: 15_000 } },
      );
      reply.code(202);
      return { id: job.id, status: job.status };
    },
  });

  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const rows = await prisma.exportJob.findMany({
        where: { tenantId: req.currentTenant!.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        exports: rows.map((r) => ({
          id: r.id,
          mailboxId: r.mailboxId,
          format: r.format,
          scope: r.scope,
          status: r.status,
          processed: r.processed,
          downloadUrl: r.downloadUrl,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
        })),
      };
    },
  });

  fastify.get('/:id/download', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const job = await prisma.exportJob.findFirst({
        where: { id, tenantId: req.currentTenant!.id },
      });
      if (!job) throw errors.notFound('export_not_found');
      if (job.status !== 'completed')
        throw errors.badRequest('export_not_ready', 'Export has not finished yet');
      if (job.expiresAt && job.expiresAt.getTime() < Date.now())
        throw errors.badRequest('export_expired', 'Export download link has expired');

      const file = path.join(EXPORT_DIR, `${job.id}.mbox`);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) throw errors.notFound('export_file_missing');

      reply
        .header('content-type', 'application/mbox')
        .header('content-length', stat.size)
        .header(
          'content-disposition',
          `attachment; filename="cloudmail-export-${job.id}.mbox"`,
        );
      const stream = (await fs.open(file, 'r')).createReadStream();
      return reply.send(stream);
    },
  });
};

export default routes;
