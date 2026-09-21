import type { FastifyPluginAsync } from 'fastify';
import net from 'node:net';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

/**
 * `/v1/health` is deep: it actually probes every dependency and reports each
 * component's status. Ops dashboards should hit this instead of a shallow ping.
 * `/v1/live` is a shallow OK — for load balancers.
 */
const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/live', async () => ({ ok: true, ts: Date.now() }));

  fastify.get('/health', async () => {
    const [db, cache, imap, smtp] = await Promise.all([
      checkDb(),
      checkRedis(),
      checkTcp(env.IMAP_HOST, env.IMAP_PORT),
      checkTcp(env.SMTP_SUBMISSION_HOST, env.SMTP_SUBMISSION_PORT),
    ]);
    const overall = [db, cache, imap, smtp].every((c) => c.ok);
    return {
      ok: overall,
      components: { db, cache, imap, smtp },
      time: new Date().toISOString(),
    };
  });
};

async function checkDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now();
  try {
    const pong = await redis.ping();
    return { ok: pong === 'PONG', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

async function checkTcp(host: string, port: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: 1500 });
    sock.once('connect', () => {
      sock.destroy();
      resolve({ ok: true });
    });
    sock.once('timeout', () => {
      sock.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    sock.once('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

export default routes;
