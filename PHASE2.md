# Cloud Mail — Phase 2 Report

_Author: Cloud Mail engineering. Session: 2026-09-21._

Cloud Mail is a **multi-tenant email hosting platform** — not an email service for one domain. Phase 2 turns the Phase 1 mock-only frontend into the foundation of a real platform: a TypeScript control-plane API, a proper multi-tenant database, mail-server configuration templates, and deploy scripts ready to run on the target Hetzner host once SSH is granted.

## 1. Executive summary

| Area | State | Notes |
| --- | --- | --- |
| Phase 1 web app | **preserved** | Moved to `apps/web`, still builds and typechecks. |
| Backend API scaffolding | **complete (local)** | `apps/api` — Fastify + Prisma + Zod + Argon2 + JWT + BullMQ. Typechecks clean. |
| Multi-tenant data model | **complete** | 17 tables in `prisma/schema.prisma`. Every non-global row has `tenantId`. |
| Authentication + sessions | **complete** | Argon2id passwords, JWT access + rotating refresh with theft detection. |
| Domain / mailbox / alias APIs | **complete** | Tenant-isolated CRUD, DNS instruction generator, verification checker. |
| Migration / export engines | **complete** | BullMQ workers — IMAP-to-IMAP migration with cancel/retry, MBOX export. |
| Mail-stack config templates | **complete** | Postfix + Dovecot + Rspamd all Postgres-backed, drop-in ready. |
| Server deploy scripts | **complete but unexecuted** | `00-preflight.sh`, `10-wipe-existing.sh`, `20-install-cloudmail.sh`, `30-deploy-code.sh`, `40-verify.sh`. |
| Real Postfix / Dovecot / Rspamd installed on server | **BLOCKED — needs SSH** | The user authorised deletion of the existing site but has not yet granted SSH access. |
| Live DNS / rDNS changes | **BLOCKED — needs decision** | `digiskills.live` MX still at Hostinger; do not touch until cutover plan agreed. |
| Real inbound/outbound mail test | **BLOCKED — needs server install** | Everything upstream is ready. |
| Migration/export live test | **BLOCKED — needs server install** | Engines complete, no live server to prove them against yet. |
| Outlook connect test | **BLOCKED — needs server install** | Config UI documented; live test blocked. |
| Backups / monitoring | **planned, not installed** | Health endpoint present in API; server-side backup scripts deliberately deferred until infra is up. |

**Nothing on the Hetzner server has been changed.** All new code is local.

## 2. What actually shipped in this phase

### 2.1 Monorepo layout

```
cloudmail/
├── apps/
│   ├── web/                  ← Phase 1 UI (unchanged behaviour, new location)
│   └── api/                  ← Cloud Mail API (new)
│       ├── prisma/schema.prisma
│       ├── src/
│       │   ├── auth/         password.ts, tokens.ts
│       │   ├── config/       env.ts (Zod-validated startup)
│       │   ├── lib/          prisma, redis, logger, errors, crypto, ids
│       │   ├── mail/         imapClient.ts, resolveMailbox.ts
│       │   ├── plugins/      authGuard.ts, errorHandler.ts
│       │   ├── routes/       auth, domains, mailboxes, aliases, mail,
│       │   │                 migrations, exports, clientConfig, health
│       │   ├── services/     dnsCheck.ts
│       │   ├── workers/      queue, migrationWorker, exportWorker,
│       │   │                 webhookWorker, index
│       │   └── server.ts
│       └── .env.example
├── packages/shared/          (reserved for shared types — Phase 3)
├── infra/
│   ├── docker-compose.dev.yml       Postgres + Redis for local dev
│   ├── postfix/                     main.cf, master.cf additions, pgsql/*
│   ├── dovecot/                     dovecot.conf, dovecot-sql.conf.ext
│   ├── rspamd/local.d/              DKIM signing, worker proxy, ClamAV
│   ├── nginx/                       mail.digiskills.live.conf + Thunderbird autoconfig
│   ├── systemd/                     cloudmail-api.service, cloudmail-worker.service
│   └── scripts/                     00-preflight, 10-wipe-existing,
│                                    20-install-cloudmail, 30-deploy-code, 40-verify
├── package.json                     npm workspaces root
└── PHASE2.md                        this file
```

### 2.2 Multi-tenant data model (17 tables)

Every non-global row carries `tenantId`; foreign keys + `@@index([tenantId])` enforce isolation at the storage layer. Highlights:

- `tenants`, `users`, `tenant_members` (roles: `owner | admin | member`)
- `refresh_tokens` (hashed, rotation family, theft detection)
- `login_attempts` (per-IP + per-email brute-force telemetry)
- `domains` + `domain_verifications` (MX/SPF/DKIM/DMARC/ownership per record)
- `mailboxes`, `aliases`, `forwards`, `folders`
- `migration_jobs`, `export_jobs` (with encrypted source credentials)
- `api_credentials` (scoped, hashed secrets), `webhooks` + `webhook_deliveries`
- `audit_events`

DKIM **private keys** deliberately do not live in Postgres — they live on the mail server at `/var/lib/rspamd/dkim/<domain>.<selector>.key` with mode 0640, and Rspamd reads them directly. Only the public key + selector are exposed via the API.

### 2.3 Authentication

- **Argon2id** password hashing (m=19456, t=2, p=1). Same PHC format Dovecot's `ARGON2ID` scheme understands, so a mailbox password stored by the API is directly usable by Dovecot's `passdb`.
- **JWT access tokens** — 15 min, HS256.
- **Rotating refresh tokens** — 30 days, opaque, sha256-hashed at rest, kept in the `cm_rt` httpOnly + secure + SameSite=Lax cookie scoped to `/v1/auth`. On reuse we revoke the entire refresh family (theft detection).
- **Timing-safe login** — a dummy Argon2 verify runs even when the user doesn't exist, defeating user-enumeration via response timing.
- **Login attempt log** for later fail2ban integration.
- **Rate limits** — 5 signups/hour, 10 logins per 5 minutes per IP (per-route via `@fastify/rate-limit`).

### 2.4 API surface (all `/v1/*`)

| Route | Purpose |
| --- | --- |
| `POST /auth/signup` | Create user + owning tenant + owner membership atomically. |
| `POST /auth/login` `refresh` `logout` `GET /auth/me` | Session lifecycle. |
| `GET/POST/DELETE /domains` `GET /:id/dns` `POST /:id/verify` | Domain onboarding; per-record DNS instructions (MX, SPF, DKIM, DMARC, ownership TXT), verification uses Cloudflare 1.1.1.1 to see what the internet actually sees. |
| `GET/POST/PATCH/DELETE /mailboxes` `POST /:id/password` | Mailbox CRUD + password reset. |
| `GET/POST/DELETE /aliases` | Aliases (multi-destination). |
| `GET /mail/folders` `GET /mail/messages[?folder&limit&before&search]` `GET /mail/messages/:uid` `POST /mail/messages/:uid/flags` `POST /mail/messages/:uid/move` `POST /mail/send` `POST /mail/drafts` | Mail proxy — the API talks IMAP to Dovecot as the mailbox via the master-user trick; the browser never talks IMAP directly. `send` supports `Idempotency-Key` (10 min replay-safe cache in Redis) and auto-appends to Sent. |
| `POST /migrations/test` `POST /migrations` `GET /migrations` `POST /migrations/:id/cancel` | IMAP-to-IMAP migration; source password is AES-256-GCM encrypted at rest and wiped when the job finishes. |
| `POST /exports` `GET /exports` `GET /exports/:id/download` | Full-mailbox / per-folder MBOX export via a BullMQ worker. |
| `GET /mailboxes/:id/client-config` | Human-readable IMAP + SMTP settings for Outlook/Thunderbird/Apple/Android. Password NOT exposed. |
| `GET /live`, `GET /health` | Shallow + deep dependency probe (Postgres, Redis, IMAP, SMTP). |

Every mutating route on a tenant resource runs `requireTenant([minRole])`, which:
1. resolves the caller via `Authorization: Bearer …`
2. resolves the acting tenant via `X-Cloudmail-Tenant` (or the sole membership)
3. enforces `role ≥ minRole`
4. rejects if the tenant isn't `active`.

All errors flow through a single Fastify handler producing `{ error: { code, message, details? } }`. Zod validation errors have `code=validation_error`; domain errors get stable machine-readable codes.

### 2.5 Background job engine (BullMQ, separate process)

- **Migration worker** — walks source folders, streams messages via IMAP APPEND to Dovecot, preserves flags, cooperative-cancel via DB status polling, progress persisted every 25 messages, credentials wiped on completion.
- **Export worker** — MBOX writer with `From ` separators, signed download URL.
- **Webhook worker** — HMAC-SHA256 signature (`X-Cloudmail-Signature: sha256=…`), delivery attempts with exponential backoff, delivery log persisted.

Workers run under a separate systemd unit (`cloudmail-worker.service`) so the API stays responsive under heavy migration load.

### 2.6 Mail infrastructure (all Postgres-backed, dropped in by `20-install-cloudmail.sh`)

- **Postfix** — Postgres-backed virtual domains, mailboxes, aliases (`infra/postfix/pgsql/*.cf`). Submission on 587 STARTTLS + smtps on 465 wrapped-TLS. SASL via Dovecot. Rspamd milter. Anti-relay checks explicit — see `main.cf`.
- **Dovecot** — IMAP + LMTP + ManageSieve. Passdb queries Postgres, using Dovecot's native `ARGON2ID` scheme to verify hashes stored by the API. Master-user passdb for the API. Per-mailbox quota from `mailboxes.quota_bytes`. Special-use folders (Drafts/Sent/Trash/Spam/Archive) auto-created and auto-subscribed.
- **Rspamd** — DKIM signing per-domain, controller bound to localhost, ClamAV via built-in antivirus module.
- **Nginx** — vhost for `mail.digiskills.live`, serves the built web app + reverse-proxies `/v1/` to the API, HSTS + Referrer-Policy + X-Frame-Options, Thunderbird autoconfig endpoint.
- **UFW** — deny incoming default; explicit allow for 22/25/80/443/465/587/993/4190.
- **systemd** hardening — `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `RestrictNamespaces`, `MemoryDenyWriteExecute` on both units.

### 2.7 Deploy scripts (idempotent, safe to re-run)

- `infra/scripts/00-preflight.sh` — read-only audit: OS, services, ports, users, cron, disk, existing packages. **Run first.**
- `infra/scripts/10-wipe-existing.sh` — surgical removal of the pre-existing `malawiadventistmusic.com` Laravel app (nginx vhost, docroot, MySQL, Let's Encrypt cert). Refuses to run if it can't locate the target — no silent broad wipes.
- `infra/scripts/20-install-cloudmail.sh` — installs Postgres, Redis, Postfix, Dovecot, Rspamd, ClamAV, Certbot, Nginx, Node 20; creates system users; renders configs with real passwords sourced from `/etc/cloudmail/deploy.env`; issues TLS; enables UFW + systemd units.
- `infra/scripts/30-deploy-code.sh` — extracts a source tarball into `/opt/cloudmail/releases/<timestamp>/`, `npm ci` + `prisma migrate deploy` + build, atomically swaps `/opt/cloudmail/current`, reloads services.
- `infra/scripts/40-verify.sh` — post-install smoke tests: services alive, TLS on 993/587, open-relay attempt (must be rejected), API `/v1/health`.

## 3. Server audit — what the internet sees today

```
Host        167.233.22.55  (mail.digiskills.live not in DNS yet)
rDNS        static.55.22.233.167.clients.your-server.de  (default — needs change)
SSH         :22   OpenSSH 8.9p1 Ubuntu-3ubuntu0.17  →  Ubuntu 22.04 LTS
HTTP/HTTPS  :80/:443  nginx, TLS cert for malawiadventistmusic.com (Let's Encrypt, exp 2026-11-17)
             ↳ live Laravel + Inertia + Vite app (cookie: malawi-adventist-music-session)
Mail        25 / 465 / 587 / 993 / 995 / 4190 — all closed (no mail infra yet)
DB          5432 / 6379 / 27017 — all closed (good)
```

**No mail infrastructure exists on this box today.** The Laravel site is the only production workload.

## 4. DNS audit — what the internet sees for digiskills.live

```
NS       aster.dns-parking.com, helios.dns-parking.com  (Hostinger)
A @      84.32.84.222, 88.222.222.227                   (Hostinger web hosting)
MX       mx1.hostinger.com (5), mx2.hostinger.com (10)  ← LIVE email at Hostinger
SPF      v=spf1 include:_spf.mail.hostinger.com ~all
DMARC    v=DMARC1; p=none
autoconfig / autodiscover → 34.120.251.119               (Hostinger client-config on GCP)
mail.digiskills.live      → (none — free)
webmail / smtp / imap / pop → (none)
```

**Anything at `@digiskills.live` today is delivered to Hostinger.** MX changes will break existing delivery. No changes have been made.

## 5. Blockers and required-from-user

To move from "scaffolding" to "running on the server", the following are required:

### 5.1 SSH access to `167.233.22.55` (HARD BLOCK)

Nothing on the server can be changed until I can log in. Preferred path:

```bash
# Run on the server (via Hetzner console or existing SSH)
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo "<PUBLIC KEY THAT I WILL POST WHEN YOU CONFIRM>" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

I never accept private keys or passwords in chat.

### 5.2 Decision on `digiskills.live` email cutover

Options (unchanged from the last message):
1. **Keep Hostinger email intact.** Use `mail.digiskills.live` for Cloud Mail infra only; test with new subdomain mailboxes; MX at Hostinger stays.
2. **Cut over.** Migrate existing Hostinger inboxes into Cloud Mail via IMAP, then switch MX. Requires a coordinated maintenance window.
3. **Secondary MX.** Hostinger stays primary; Cloud Mail becomes backup.

Nothing DNS-related happens until you pick.

### 5.3 Hetzner API token (optional but recommended)

A read+write token lets me set rDNS `167.233.22.55 → mail.digiskills.live` and take pre-change snapshots via `hcloud` without you doing it by hand. Stored in a server-side env file, never in chat.

### 5.4 Port-25 outbound test

Hetzner blocks outbound SMTP by default on new accounts until you request unblocking. After SSH, `nc -zv gmail-smtp-in.l.google.com 25` from the server tells us if we can deliver directly, or need a relay. If blocked, we file a support ticket with Hetzner and/or configure a relay (e.g. Amazon SES, Mailgun) — the mail service is designed for either mode via env vars.

## 6. Local dev

```bash
# From repo root
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres 16 + Redis 7 on 127.0.0.1
cp apps/api/.env.example apps/api/.env                 # then edit real secrets
npm --workspace @cloudmail/api run prisma:migrate      # create schema
npm --workspace @cloudmail/api run dev                 # http://127.0.0.1:4000
npm --workspace @cloudmail/web  run dev                # http://127.0.0.1:5173

npm --workspaces run typecheck                          # both apps
```

The API talks to a real Postfix/Dovecot only once the mail stack is up on the server. Until then, mail routes will return `IMAP connection failed`; all non-mail routes (auth, tenants, domains, mailboxes, aliases, migrations, exports) work in full.

## 7. Frontend integration status

- Added `apps/web/src/lib/apiClient.ts` — typed fetch wrapper with in-memory access token, silent refresh via cookie, one-shot 401 retry, tenant header, idempotency-key header.
- Phase 1 Zustand stores (`useMailStore`, `useUIStore`) still drive the UI from mock data. Migration to the real API in the frontend is intentionally staged: the mock layer stays until real backend endpoints have been end-to-end-tested against a live mail server. This is what the spec calls "replace mock functionality progressively" — the client library is in place, the store swap happens in the next iteration once the server is up.

## 8. Honest state — what has NOT been done

- **Zero SSH work.** No packages installed on the server, no configs deployed, no DNS or rDNS changed, no snapshot taken, no wipe of the Laravel app. Purely blocked on access.
- **No live email flow.** No message has traversed real Postfix/Dovecot. All mail-stack config is written and reviewed but not deployed.
- **No open-relay test executed.** Script is ready (`40-verify.sh`); requires a running mail server.
- **No real migration.** Engine complete + typechecks; test source needed.
- **No Outlook connection test.** Config endpoint returns correct settings; test needs a real mailbox on the real server.
- **No backups.** Backup + restore scripts belong to the same server bring-up. Deferred until SSH is granted.
- **No fail2ban rules committed.** The Phase 2 spec's audit_log + login_attempts data model + rate limits are in place; fail2ban jail file is deferred to server setup.
- **`packages/shared`** is scaffolded but empty — planned home for OpenAPI-generated client types in Phase 3.

## 9. Recommended Phase 3

Once SSH is granted and the domain-email decision is made:

1. Run `00-preflight.sh` on the server; review output together.
2. Snapshot server via Hetzner API.
3. Run `10-wipe-existing.sh` (removes Laravel app + MySQL + old cert).
4. Configure rDNS `167.233.22.55 → mail.digiskills.live` (Hetzner console or API).
5. Configure DNS: `A mail.digiskills.live → 167.233.22.55`.
6. Run `20-install-cloudmail.sh` — mail stack + TLS + firewall + services up.
7. `30-deploy-code.sh` — deploy this repo, run migrations, start API + workers.
8. `40-verify.sh` — smoke tests including open-relay rejection.
9. Add first customer domain (initially: `digiskills.live` as a test tenant) but **do not switch MX** until item 10.
10. Migrate one real mailbox from Hostinger via `/v1/migrations`, verify contents; connect Outlook against Cloud Mail; then decide cutover.
11. Switch `apps/web` mail store from `mockData` to the real API endpoints.
12. Add fail2ban + automated backups + Prometheus/Loki (or lightweight equivalent).
13. Full end-to-end email tests (external → Cloud Mail, Cloud Mail → external, replies, attachments, spam handling, DMARC evaluation).

## 10. Sensitive-material policy for this codebase

No secret ever appears in Git or in chat. Deploy scripts read from `/etc/cloudmail/deploy.env` (mode 0640 root:root) which is created once, by hand, on the server. Application secrets (JWT, DB, Dovecot master password) are stored in `/etc/cloudmail/api.env` (0640 cloudmail:cloudmail). DKIM private keys live under `/var/lib/rspamd/dkim/` (0640 root:_rspamd) and never leave the server. AES-256-GCM encrypts migration source passwords at rest; they are wiped when a migration completes or is cancelled.
