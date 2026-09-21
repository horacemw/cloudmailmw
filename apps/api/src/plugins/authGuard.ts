import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken } from '../auth/tokens.js';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import type { Tenant, TenantMember, TenantRole, User } from '@prisma/client';

/**
 * Adds:
 *   - request.currentUser (populated after `requireAuth`)
 *   - request.currentTenant (populated after `requireTenant`)
 *   - fastify.requireAuth() preHandler
 *   - fastify.requireTenant(role?) preHandler
 *
 * Tenant selection uses the X-Cloudmail-Tenant header (tenant slug or id).
 * If the user has exactly one membership, we auto-select it — but any
 * mismatch between header and membership is a 403.
 */

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
    currentTenant?: Tenant;
    currentMembership?: TenantMember;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest) => Promise<void>;
    requireTenant: (
      req: FastifyRequest,
      minRole?: TenantRole,
    ) => Promise<void>;
  }
}

async function authenticate(req: FastifyRequest): Promise<User> {
  if (req.currentUser) return req.currentUser;
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw errors.unauthorized();
  }
  const payload = verifyAccessToken(header.slice(7));
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'active') throw errors.unauthorized('user_inactive');
  req.currentUser = user;
  return user;
}

async function selectTenant(
  req: FastifyRequest,
  minRole: TenantRole | undefined,
): Promise<{ tenant: Tenant; membership: TenantMember }> {
  const user = await authenticate(req);
  const requested = (req.headers['x-cloudmail-tenant'] as string | undefined)?.trim();

  const memberships = await prisma.tenantMember.findMany({
    where: { userId: user.id },
    include: { tenant: true },
  });
  if (memberships.length === 0) {
    throw errors.forbidden('no_tenant', 'You do not belong to any organization yet');
  }

  let selected = memberships[0]!;
  if (requested) {
    const match = memberships.find(
      (m) => m.tenant.slug === requested || m.tenant.id === requested,
    );
    if (!match) throw errors.forbidden('tenant_denied', 'You do not have access to that organization');
    selected = match;
  } else if (memberships.length > 1) {
    // Ambiguous — force the client to pick.
    throw errors.badRequest('tenant_required', 'X-Cloudmail-Tenant header is required');
  }

  if (minRole && !roleAtLeast(selected.role, minRole)) {
    throw errors.forbidden('role_insufficient', 'Your role does not permit this action');
  }
  if (selected.tenant.status !== 'active') {
    throw errors.forbidden('tenant_inactive', 'Organization is not active');
  }

  req.currentTenant = selected.tenant;
  req.currentMembership = selected;
  return { tenant: selected.tenant, membership: selected };
}

const ROLE_RANK: Record<TenantRole, number> = { member: 1, admin: 2, owner: 3 };
function roleAtLeast(actual: TenantRole, min: TenantRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[min];
}

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('requireAuth', async (req: FastifyRequest) => {
    await authenticate(req);
  });
  fastify.decorate(
    'requireTenant',
    async (req: FastifyRequest, minRole?: TenantRole) => {
      await selectTenant(req, minRole);
    },
  );
};

export default fp(plugin, { name: 'auth-guard' });
