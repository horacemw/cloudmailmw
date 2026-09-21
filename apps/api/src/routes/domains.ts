import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { errors } from '../lib/errors.js';
import { checkRecord, planDomainRecords } from '../services/dnsCheck.js';
import { ensureDkimForDomain } from '../services/dkim.js';
import { notifyTenantAdmins } from '../services/notify.js';
import { logger } from '../lib/logger.js';
import type { DnsCheckKind, DomainStatus } from '@prisma/client';

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

const routes: FastifyPluginAsync = async (fastify) => {
  /* ─── GET /v1/domains ─────────────────────────────────────────── */
  fastify.get('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const domains = await prisma.domain.findMany({
        where: { tenantId: req.currentTenant!.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        include: { verifications: true },
      });
      return {
        domains: domains.map((d) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          isPrimary: d.isPrimary,
          dkimSelector: d.dkimSelector,
          dkimReady: Boolean(d.dkimPublicKey),
          verifications: summariseChecks(d.verifications),
          createdAt: d.createdAt,
        })),
      };
    },
  });

  /* ─── POST /v1/domains ────────────────────────────────────────── */
  fastify.post('/', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const body = z.object({ name: z.string().transform((v) => v.trim().toLowerCase()) }).parse(req.body);
      if (!DOMAIN_RE.test(body.name)) throw errors.badRequest('invalid_domain', 'Not a valid domain name');

      const existing = await prisma.domain.findUnique({ where: { name: body.name } });
      if (existing) throw errors.conflict('domain_taken', 'Domain is already registered on Cloud Mail');

      const tenantId = req.currentTenant!.id;
      const domain = await prisma.domain.create({
        data: {
          tenantId,
          name: body.name,
          status: 'verification_required',
          isPrimary: (await prisma.domain.count({ where: { tenantId } })) === 0,
        },
      });

      // Generate a per-domain DKIM key pair on the server. If the API is
      // running somewhere that can't reach the server disk (e.g. dev laptop),
      // just log the failure — the domain still gets created; the operator
      // can rotate the key from the /rotate endpoint later.
      try {
        await ensureDkimForDomain(domain.id);
      } catch (err) {
        logger.warn({ err, domain: domain.name }, 'dkim_keygen_failed_on_domain_create');
      }
      const withKey = await prisma.domain.findUnique({ where: { id: domain.id } });

      // Precompute all verification rows so the dashboard can show them immediately.
      const plan = planDomainRecords(
        withKey!.name,
        withKey!.ownershipToken,
        withKey?.dkimPublicKey ?? undefined,
      );
      await prisma.$transaction(
        plan.map((p) =>
          prisma.domainVerification.create({
            data: {
              domainId: domain.id,
              kind: p.kind as DnsCheckKind,
              expectedValue: p.expectedContains,
            },
          }),
        ),
      );

      await prisma.auditEvent.create({
        data: {
          tenantId,
          actorUserId: req.currentUser!.id,
          action: 'domain.added',
          targetType: 'domain',
          targetId: domain.id,
          metadata: { name: domain.name, dkimGenerated: Boolean(withKey?.dkimPublicKey) },
          ipAddress: req.ip,
        },
      });

      return dnsInstructionsFor(withKey!);
    },
  });

  /* ─── POST /v1/domains/:id/dkim/generate  (retry/rotate) ─────── */
  fastify.post('/:id/dkim/generate', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const domain = await loadTenantDomain(req.currentTenant!.id, id);
      const { publicKey } = await ensureDkimForDomain(domain.id);
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'domain.dkim_generated',
          targetType: 'domain',
          targetId: domain.id,
          metadata: { name: domain.name, selector: domain.dkimSelector },
          ipAddress: req.ip,
        },
      });
      const updated = await prisma.domain.findUnique({ where: { id: domain.id } });
      return {
        selector: updated!.dkimSelector,
        publicKey,
        dnsRecord: `v=DKIM1; k=rsa; p=${publicKey}`,
      };
    },
  });

  /* ─── GET /v1/domains/:id/dns  (records the customer needs to add) ─ */
  fastify.get('/:id/dns', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req)],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const domain = await loadTenantDomain(req.currentTenant!.id, id);
      return dnsInstructionsFor(domain);
    },
  });

  /* ─── POST /v1/domains/:id/verify  (re-check records) ─────────── */
  fastify.post('/:id/verify', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'admin')],
    handler: async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const domain = await loadTenantDomain(req.currentTenant!.id, id);
      const plan = planDomainRecords(domain.name, domain.ownershipToken, domain.dkimPublicKey ?? undefined);
      const now = new Date();

      const results = await Promise.all(
        plan.map(async (p) => {
          const r = await checkRecord(p);
          await prisma.domainVerification.upsert({
            where: { domainId_kind: { domainId: domain.id, kind: p.kind as DnsCheckKind } },
            create: {
              domainId: domain.id,
              kind: p.kind as DnsCheckKind,
              expectedValue: p.expectedContains,
              observedValue: r.observed ?? null,
              passed: r.passed,
              lastCheckedAt: now,
            },
            update: {
              expectedValue: p.expectedContains,
              observedValue: r.observed ?? null,
              passed: r.passed,
              lastCheckedAt: now,
            },
          });
          return { kind: p.kind, ...r };
        }),
      );

      // Ownership + MX must pass to move to `verified`; DKIM/DMARC gate `active`.
      const ownershipOk = results.find((r) => r.kind === 'ownership_txt')?.passed ?? false;
      const mxOk = results.find((r) => r.kind === 'mx')?.passed ?? false;
      const dkimOk = results.find((r) => r.kind === 'dkim')?.passed ?? false;
      const spfOk = results.find((r) => r.kind === 'spf')?.passed ?? false;

      const nextStatus: DomainStatus = !ownershipOk
        ? 'verification_required'
        : ownershipOk && mxOk && spfOk && dkimOk
          ? 'active'
          : 'verified';

      await prisma.domain.update({ where: { id: domain.id }, data: { status: nextStatus } });

      if (nextStatus === 'active' && domain.status !== 'active') {
        await prisma.auditEvent.create({
          data: {
            tenantId: req.currentTenant!.id,
            actorUserId: req.currentUser!.id,
            action: 'domain.activated',
            targetType: 'domain',
            targetId: domain.id,
            metadata: { name: domain.name },
            ipAddress: req.ip,
          },
        });
        await notifyTenantAdmins({
          tenantId: req.currentTenant!.id,
          kind: 'domain_verified',
          title: `${domain.name} is active`,
          body: 'Every required DNS record passed verification. You can now create mailboxes on this domain.',
          targetType: 'domain',
          targetId: domain.id,
        });
      }

      return { status: nextStatus, results };
    },
  });

  /* ─── DELETE /v1/domains/:id  (soft-guarded) ──────────────────── */
  fastify.delete('/:id', {
    preHandler: [fastify.requireAuth, (req) => fastify.requireTenant(req, 'owner')],
    handler: async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const domain = await loadTenantDomain(req.currentTenant!.id, id);
      const mailboxCount = await prisma.mailbox.count({ where: { domainId: domain.id } });
      if (mailboxCount > 0)
        throw errors.conflict('domain_has_mailboxes', 'Delete or move mailboxes first');
      await prisma.domain.delete({ where: { id: domain.id } });
      await prisma.auditEvent.create({
        data: {
          tenantId: req.currentTenant!.id,
          actorUserId: req.currentUser!.id,
          action: 'domain.removed',
          targetType: 'domain',
          targetId: domain.id,
          metadata: { name: domain.name },
          ipAddress: req.ip,
        },
      });
      reply.code(204);
    },
  });
};

/* ─── helpers ──────────────────────────────────────────────────── */

async function loadTenantDomain(tenantId: string, id: string) {
  const d = await prisma.domain.findFirst({
    where: { id, tenantId },
    include: { verifications: true },
  });
  if (!d) throw errors.notFound('domain_not_found');
  return d;
}

function summariseChecks(rows: Array<{ kind: DnsCheckKind; passed: boolean; lastCheckedAt: Date | null }>) {
  return Object.fromEntries(
    rows.map((r) => [r.kind, { passed: r.passed, lastCheckedAt: r.lastCheckedAt }]),
  );
}

function dnsInstructionsFor(domain: {
  id: string;
  name: string;
  status: DomainStatus;
  ownershipToken: string;
  dkimSelector: string;
  dkimPublicKey: string | null;
}) {
  const plan = planDomainRecords(domain.name, domain.ownershipToken, domain.dkimPublicKey ?? undefined);
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    dkimSelector: domain.dkimSelector,
    dkimPublicKey: domain.dkimPublicKey,
    records: plan.map((p) => ({
      kind: p.kind,
      type: p.type,
      host: shortHost(p.name, domain.name),
      value: fullValueFor(p, domain),
      ttl: p.ttl ?? 3600,
      purpose: p.purpose,
    })),
  };
}

function shortHost(name: string, apex: string): string {
  if (name === apex) return '@';
  if (name.endsWith(`.${apex}`)) return name.slice(0, name.length - apex.length - 1);
  return name;
}

function fullValueFor(
  p: ReturnType<typeof planDomainRecords>[number],
  domain: { name: string; ownershipToken: string; dkimSelector: string; dkimPublicKey: string | null },
): string {
  switch (p.kind) {
    case 'ownership_txt':
      return `cloudmail-verify=${domain.ownershipToken}`;
    case 'mx':
      return `10 ${process.env.CLOUDMAIL_INITIAL_MAIL_HOST ?? 'mail.digiskills.live'}.`;
    case 'spf':
      return `v=spf1 include:_spf.${process.env.CLOUDMAIL_INITIAL_MAIL_HOST ?? 'mail.digiskills.live'} -all`;
    case 'dkim':
      return domain.dkimPublicKey
        ? `v=DKIM1; k=rsa; p=${domain.dkimPublicKey}`
        : 'v=DKIM1; k=rsa; p=(pending key generation)';
    case 'dmarc':
      return `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${domain.name}; adkim=r; aspf=r`;
    default:
      return p.expectedContains;
  }
}

export default routes;
