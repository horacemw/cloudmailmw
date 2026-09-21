import type { FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';

/**
 * A request can act on a mailbox in two ways:
 *   1) `X-Cloudmail-Mailbox: <mailbox-id-or-address>` header (admin/support).
 *   2) The user's own membership.mailboxId (regular users).
 *
 * Both paths enforce tenant isolation and return the fully-loaded mailbox row.
 */
export async function resolveMailboxForRequest(req: FastifyRequest) {
  const tenant = req.currentTenant;
  const membership = req.currentMembership;
  if (!tenant || !membership) throw errors.forbidden();

  const explicit = (req.headers['x-cloudmail-mailbox'] as string | undefined)?.trim();
  if (explicit) {
    if (membership.role === 'member') throw errors.forbidden('mailbox_override_forbidden');
    const mailbox = await prisma.mailbox.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ id: explicit }, { address: explicit.toLowerCase() }],
      },
    });
    if (!mailbox) throw errors.notFound('mailbox_not_found');
    return mailbox;
  }

  if (!membership.mailboxId)
    throw errors.badRequest('mailbox_required', 'No mailbox assigned to this user');
  const mailbox = await prisma.mailbox.findFirst({
    where: { id: membership.mailboxId, tenantId: tenant.id },
  });
  if (!mailbox) throw errors.notFound('mailbox_not_found');
  return mailbox;
}
