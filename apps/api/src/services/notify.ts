import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { NotificationKind } from '@prisma/client';

/**
 * Single entrypoint every producer calls. Never throws — a notification
 * write failure must not roll back the underlying action (creating a
 * mailbox, verifying a domain, etc.).
 */
export async function notify(input: {
  userId: string;
  tenantId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  targetType?: string;
  targetId?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, kind: input.kind, userId: input.userId }, 'notification_write_failed');
  }
}

/**
 * Broadcast a notification to every owner/admin member of a tenant.
 */
export async function notifyTenantAdmins(input: {
  tenantId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  targetType?: string;
  targetId?: string;
}): Promise<void> {
  try {
    const admins = await prisma.tenantMember.findMany({
      where: { tenantId: input.tenantId, role: { in: ['owner', 'admin'] } },
      select: { userId: true },
    });
    await Promise.all(
      admins.map((m) =>
        notify({
          userId: m.userId,
          tenantId: input.tenantId,
          kind: input.kind,
          title: input.title,
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
          ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, tenantId: input.tenantId }, 'tenant_notification_broadcast_failed');
  }
}
