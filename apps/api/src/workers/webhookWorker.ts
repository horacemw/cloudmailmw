import { Worker, type Job } from 'bullmq';
import crypto from 'node:crypto';
import { bullConnection, QUEUE_NAMES } from './queue.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

interface WebhookPayload {
  deliveryId: string;
}

/**
 * Delivers a webhook with an HMAC-SHA256 signature over the body. Retries
 * with exponential backoff via BullMQ; permanent failure after 6 attempts.
 */
export const webhookWorker = new Worker<WebhookPayload>(
  QUEUE_NAMES.webhooks,
  async (job: Job<WebhookPayload>) => {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { webhook: true },
    });
    if (!delivery || !delivery.webhook.active) return;

    const body = JSON.stringify(delivery.payload);
    const signature = crypto
      .createHmac('sha256', delivery.webhook.secret)
      .update(body)
      .digest('hex');

    try {
      const res = await fetch(delivery.webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'CloudMail-Webhook/1.0',
          'x-cloudmail-event': delivery.event,
          'x-cloudmail-delivery': delivery.id,
          'x-cloudmail-signature': `sha256=${signature}`,
          'x-cloudmail-timestamp': Date.now().toString(),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: res.ok ? 'success' : 'failed',
          responseCode: res.status,
          attemptCount: { increment: 1 },
        },
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
    } catch (err) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed', attemptCount: { increment: 1 } },
      });
      logger.warn({ err, deliveryId: delivery.id }, 'webhook_delivery_failed');
      throw err;
    }
  },
  {
    connection: bullConnection,
    concurrency: 10,
  },
);
