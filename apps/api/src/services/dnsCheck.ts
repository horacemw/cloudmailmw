import { promises as dnsPromises, Resolver } from 'node:dns';
import { env } from '../config/env.js';

/**
 * Uses a specific public resolver (Cloudflare) rather than the host's stub —
 * we want to see what the *internet* sees, not what a locally cached record says.
 */
const resolver = new Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const resolveTxt = (name: string): Promise<string[][]> =>
  new Promise((res, rej) => resolver.resolveTxt(name, (e, r) => (e ? rej(e) : res(r))));
const resolveMx = (name: string): Promise<{ exchange: string; priority: number }[]> =>
  new Promise((res, rej) => resolver.resolveMx(name, (e, r) => (e ? rej(e) : res(r))));
const resolve4 = (name: string): Promise<string[]> =>
  new Promise((res, rej) => resolver.resolve4(name, (e, r) => (e ? rej(e) : res(r))));

export interface DnsRecordPlan {
  kind: 'mx' | 'spf' | 'dkim' | 'dmarc' | 'a' | 'ownership_txt' | 'ptr';
  name: string;              // hostname to query
  type: 'MX' | 'TXT' | 'A' | 'PTR';
  expectedContains: string;  // substring that must appear in the value
  purpose: string;
  ttl?: number;
}

export interface DnsCheckResult {
  passed: boolean;
  observed: string | null;
  reason?: string;
}

export function planDomainRecords(domain: string, ownershipToken: string, dkimPublicKey?: string) {
  const plan: DnsRecordPlan[] = [
    {
      kind: 'ownership_txt',
      name: `_cloudmail.${domain}`,
      type: 'TXT',
      expectedContains: `cloudmail-verify=${ownershipToken}`,
      purpose: 'Proves you control this domain.',
      ttl: 300,
    },
    {
      kind: 'mx',
      name: domain,
      type: 'MX',
      expectedContains: env.CLOUDMAIL_INITIAL_MAIL_HOST,
      purpose: 'Directs incoming mail to Cloud Mail servers.',
      ttl: 3600,
    },
    {
      kind: 'spf',
      name: domain,
      type: 'TXT',
      expectedContains: `include:_spf.${env.CLOUDMAIL_INITIAL_MAIL_HOST}`,
      purpose: 'Authorizes Cloud Mail to send mail for this domain.',
      ttl: 3600,
    },
    {
      kind: 'dkim',
      name: `cm1._domainkey.${domain}`,
      type: 'TXT',
      expectedContains: dkimPublicKey ? `p=${dkimPublicKey.slice(0, 20)}` : 'v=DKIM1',
      purpose: 'Public key used to verify DKIM signatures on outbound mail.',
      ttl: 3600,
    },
    {
      kind: 'dmarc',
      name: `_dmarc.${domain}`,
      type: 'TXT',
      expectedContains: 'v=DMARC1',
      purpose: 'DMARC policy for handling unauthenticated mail claiming this domain.',
      ttl: 3600,
    },
  ];
  return plan;
}

export async function checkRecord(plan: DnsRecordPlan): Promise<DnsCheckResult> {
  try {
    if (plan.type === 'MX') {
      const rows = await resolveMx(plan.name);
      const observed = rows
        .sort((a, b) => a.priority - b.priority)
        .map((r) => `${r.priority} ${r.exchange}`)
        .join(', ');
      const passed = rows.some((r) => r.exchange.toLowerCase().includes(plan.expectedContains.toLowerCase()));
      return { passed, observed };
    }
    if (plan.type === 'TXT') {
      const rows = await resolveTxt(plan.name);
      const flat = rows.map((chunks) => chunks.join(''));
      const observed = flat.join(' | ');
      const passed = flat.some((v) => v.toLowerCase().includes(plan.expectedContains.toLowerCase()));
      return { passed, observed };
    }
    if (plan.type === 'A') {
      const rows = await resolve4(plan.name);
      const observed = rows.join(', ');
      const passed = rows.some((v) => v === plan.expectedContains);
      return { passed, observed };
    }
    if (plan.type === 'PTR') {
      const observed = (await dnsPromises.reverse(plan.name)).join(', ');
      return {
        passed: observed.toLowerCase().includes(plan.expectedContains.toLowerCase()),
        observed,
      };
    }
    return { passed: false, observed: null, reason: 'unsupported_record_type' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'lookup_failed';
    return { passed: false, observed: null, reason };
  }
}
