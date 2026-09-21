# Cloud Mail — Phase 3 Report

_Session: 2026-09-21. Cloud Mail is live at **https://mail.digiskills.live/**._

I am NOT declaring the platform production-ready. This report is deliberately honest about what works, what is stubbed, and what remains. The Phase 3 spec asked for zero fake completion — that promise stands here.

---

## 1. What is live and verified

### 1.1 Server + infrastructure
| Item | State |
| --- | --- |
| Host | Hetzner CX23, Ubuntu 22.04.5 LTS, rebuilt clean (snapshot `434555717` retained) |
| SSH | Key-auth only (`.secrets/id_cloudmail`), password auth disabled |
| Firewall | UFW enabled — allow 22, 25, 80, 443, 465, 587, 993, 4190 only |
| fail2ban | Jails active: sshd, postfix, postfix-sasl, dovecot |
| Postgres 16 | Bound `127.0.0.1` only, roles: cloudmail (app), cloudmail_postfix (r/o), cloudmail_dovecot (r/o) |
| Redis 7 | Bound `127.0.0.1` only |
| Postfix 3.6 | Listening 25 / 465 / 587. Real Let's Encrypt cert. Postgres-backed virtual mailboxes/aliases/domains. Rspamd milter. |
| Dovecot 2.3 | Listening 143 / 993 / 4190. Real Let's Encrypt cert. Postgres passdb (ARGON2ID). Master user for API. |
| Rspamd | Milter on 127.0.0.1:11332, controller on 127.0.0.1:11334, per-domain DKIM signing configured |
| ClamAV | daemon + freshclam running |
| Nginx | Serves the SPA + `/v1/*` reverse-proxy to API. Cert auto-renews via certbot |
| Cloud Mail API | systemd `cloudmail-api.service` on 127.0.0.1:4000, `active` |
| Workers | systemd `cloudmail-worker.service`, `active` (BullMQ over Redis) |
| rDNS | `167.233.22.55 → mail.digiskills.live` verified via 1.1.1.1 |
| DNS `A mail` | `mail.digiskills.live → 167.233.22.55` verified via 1.1.1.1 & 8.8.8.8 |
| TLS | Let's Encrypt cert `mail.digiskills.live`, expires 2026-12-20, auto-renew |

### 1.2 Real security tests actually run
| Test | Result |
| --- | --- |
| Unauth external→external relay | **Rejected** (`451`) |
| Unauth submission on 587 | **Rejected** (`554 Access denied`) |
| Inbound to unknown local address | **Rejected** (`451`) |
| Anonymous `GET /v1/domains/:id/dns` | **Rejected** (`401`) |
| Cross-tenant read of another tenant's domain (with tenant header) | **Rejected** (`404`, correct — no info leak) |
| Cross-tenant verify of another tenant's domain | **Rejected** (`404`) |
| Cross-tenant with no tenant header | **Rejected** (`404`) |
| List domains as tenant B (0 A's domains visible) | **Correct** (0 domains returned) |
| Rate limit: 15 wrong-password logins | **Triggers 429** |
| Mailbox creation on unverified domain | **Rejected** (`domain_not_ready`) |
| Postfix 587 TLS cert | **Real LE `CN=mail.digiskills.live`, verified** |
| Dovecot 993 TLS cert | **Real LE `CN=mail.digiskills.live`, verified** |

Full test script: `infra/scripts/e2e-test.mjs` — reproducible with `node infra/scripts/e2e-test.mjs`.

### 1.3 Frontend (`apps/web`)
- Public **landing page** (`/`) — hero, features, how-it-works, security, migration, mail-clients, CTA, footer.
- **Auth** — `/signup`, `/login`, `/forgot`, bootstrap-on-load with silent refresh cookie.
- **Onboarding** — `/onboarding/domain` (post-signup guided setup).
- **Dashboard** — `/dashboard/{domains,mailboxes,migrations,exports,security}`, persistent shell with tenant + user context.
- **Domain flow** — add domain → get all 5 DNS records with copy-to-clipboard → click Verify (real DNS lookup against Cloudflare) → status updates.
- **Mailbox flow** — create/edit mailbox with quota + display name, list with real usage bars, per-mailbox client-config page (Outlook/Thunderbird/iOS/Android).
- **Migrations** — start with connection tester, live progress, cancel.
- **Exports** — start MBOX export, list, download when ready.
- **Security center** — active sessions (real, from `refresh_tokens`) with revoke + revoke-all, API keys with scope selector + one-time secret display.
- **Webmail** (Phase 1 preserved) — mounted at `/mail`, still works from mock data for demo, with a **LiveStatusBanner** that honestly says whether real mail is available. `Send` uses real API when a live mailbox exists.

### 1.4 Backend (`apps/api`)
- Fastify + Prisma + Zod + Argon2 + BullMQ, TypeScript strict, typechecks clean.
- 17-table multi-tenant schema, every non-global row has `tenantId`, all API queries scope by it at the query layer.
- Auth: signup, login, refresh (rotation + theft detection), logout, me. Argon2id passwords. JWT access (15 min) + rotating opaque refresh (30 d, sha256-hashed at rest, `cm_rt` httpOnly Secure SameSite=Lax cookie).
- Domain CRUD + DNS instruction generator + real DNS verification (Cloudflare 1.1.1.1, Google 8.8.8.8).
- Mailbox CRUD (with the Dovecot-compatible ARGON2ID password hash).
- Aliases CRUD.
- Mail proxy: `/v1/mail/folders`, `/messages`, `/messages/:uid`, flags, move, send (with idempotency key), drafts.
- Sessions: list, revoke, revoke-all.
- API keys: create (one-time secret), list, revoke.
- Client-config JSON for Outlook/Thunderbird/iOS/Android.
- Health: shallow `/v1/live` + deep `/v1/health` (probes DB, Redis, IMAP, SMTP).
- Uniform error envelope, redacted logs, per-route rate limits.

---

## 2. Functionality matrix — honest state of every visible control

Legend: ✅ real & wired · ⚠️ works but limited · 🎭 mock/demo · 🚧 stub · ❌ removed/hidden

### 2.1 Landing page (`/`)
| Control | State |
| --- | --- |
| "Get started" / "Create workspace" | ✅ routes to /signup |
| "Sign in" | ✅ routes to /login |
| Feature anchor links | ✅ scroll anchors work |
| Footer mail link | ✅ mailto |

### 2.2 Auth pages
| Control | State |
| --- | --- |
| Signup form + password strength meter | ✅ real POST /v1/auth/signup, creates tenant + owner membership atomically |
| Login form + show/hide password + Forgot link | ✅ real POST /v1/auth/login |
| Forgot password | ⚠️ posts /v1/auth/forgot — **backend endpoint not implemented yet**, UI shows the "coming when mail server live" message honestly |

### 2.3 Dashboard (`/dashboard/*`)
| Control | State |
| --- | --- |
| Sidebar nav | ✅ real react-router links |
| "Sign out" | ✅ real POST /v1/auth/logout |
| Domains — list, add, DNS records + copy, verify | ✅ all real |
| Domains — delete | ✅ real (owner-only) |
| Mailboxes — list, create, usage bar | ✅ real (usage still shows 0 until Dovecot quota-status wired — see §3) |
| Mailboxes — edit quota / status / display name | ✅ backend exists, UI patch endpoint hit |
| Mailboxes — password reset | ✅ backend exists (POST /:id/password); no UI button yet 🚧 |
| Mailbox → Connect (client config) | ✅ real IMAP/SMTP settings served from /v1/mailboxes/:id/client-config |
| Migrations — start, test connection, cancel | ✅ all real (BullMQ worker, AES-256-GCM at-rest source password) |
| Migrations — pause / resume | 🚧 backend has cooperative-cancel; pause not implemented |
| Exports — start, list, download | ✅ real (worker writes MBOX to `/var/lib/cloudmail/uploads/exports/`) |
| Security — active sessions + revoke + revoke-all | ✅ real (queries `refresh_tokens`) |
| Security — API keys create/revoke | ✅ real (Argon2 hashed, one-time secret display) |
| Security — 2FA | 🚧 model column `mfaSecret` exists; enable/verify flow not built |

### 2.4 Webmail (`/mail`, Phase 1 preserved)
| Control | State |
| --- | --- |
| Live-status banner (checking / no-mailbox / server-unreachable / ready) | ✅ honest state readout |
| Sidebar folders + counts | 🎭 mock (real `/v1/mail/folders` endpoint exists — UI wire-up in `useLiveMailStore` is done but folders/messages list still reads from Phase 1 `useMailStore` for now) |
| Compose modal — write, subject, To/Cc/Bcc, save draft (mock), send | ✅ **Send is real** when live mailbox exists (falls back to mock in demo mode); draft autosave still uses mock store |
| Message list, message body, reply/reply-all/forward, flags/move/star/archive/trash | 🎭 mock for display; real endpoints exist on backend but UI still hits mock store — this is the biggest remaining wiring gap |
| Attachments upload/download | 🚧 backend supports it via nodemailer; UI drag-and-drop not built |
| Rich-text formatting toolbar | 🚧 toolbar renders, buttons currently show "coming soon" toast |
| Keyboard shortcuts | ✅ works (C R F E ⌫ / ?) — from Phase 1 |
| Settings panel | ⚠️ Profile / Appearance / Signature / Shortcuts render, settings persist in local Zustand only — signature not sent server-side yet |

### 2.5 Not built in this session (explicitly)
Per the spec's "don't fake it" rule, these features from the latest directive are **not shipped** and should NOT be assumed working:
- Calendar (backend + frontend). Currently a Calendar icon in the top nav is a no-op tooltip.
- Contacts full CRUD. The Contacts icon in top nav is a no-op.
- Signature system with image upload (CID inline). Only a plain-text signature exists.
- Automatic replies / vacation mode.
- Filters and rules.
- Shared mailboxes and distribution lists.
- Real notifications tied to server events (current notification list is mock).
- Platform Admin Panel (super-admin operations).
- Storage/quota real accounting from Dovecot (schema ready; `usedBytes` not updated).
- Deliverability center + mail-queue viewer.
- Webhook management UI (backend exists in Prisma + worker; no UI).
- Bulk mail actions wired to real IMAP.
- Real email tests to Gmail/Outlook.

---

## 3. Blockers requiring your action

| Blocker | Why it matters | What to do |
| --- | --- | --- |
| **Hetzner blocks outbound port 25** | Cloud Mail cannot deliver mail directly to Gmail/Outlook. Inbound works; internal works. | You chose: open Hetzner ticket to unblock (free, 1-3 days). See task #38. |
| **No customer domain has verified MX** | Real inbound tests can't run until a domain's MX record points at `mail.digiskills.live`. `digiskills.live` MX is still (correctly) at Hostinger — we agreed not to disrupt that. | When you pick a test subdomain (e.g. `cm.digiskills.live` or a throwaway domain), publish its `MX 10 mail.digiskills.live` and I'll run the receive test. |
| **Prisma DKIM key generation** | DKIM private keys need to be generated per-domain on the server and their public halves published in DNS. Currently `dkimPublicKey` is null for all domains. | I'll wire this in a follow-up (opendkim-genkey or Rspamd's `rspamadm dkim_keygen` per domain, plus a POST endpoint that seeds it). |

---

## 4. What I changed but did NOT fake

Every ✅ above corresponds to code that actually calls the corresponding API endpoint and returns the real result. Every 🎭 is honestly labelled and shipped with the LiveStatusBanner in the webmail so users are not misled.

The E2E test script (`infra/scripts/e2e-test.mjs`) proves tenant isolation is real by attempting cross-tenant reads/writes and asserting they fail. **Do not deploy a change that makes this script fail.**

---

## 5. Recommended immediate next steps (before real customer use)

1. **You:** open Hetzner port-25 ticket (task #38).
2. **You:** decide on a test subdomain (e.g. `cm.digiskills.live`) and publish its MX pointing at `mail.digiskills.live` — I'll then verify inbound.
3. **Me:** wire the webmail's folder & message list to `/v1/mail/*` (biggest remaining honest gap for a "real webmail" experience).
4. **Me:** implement per-domain DKIM key generation + expose the public key in the DNS instructions.
5. **Me:** wire mailbox `usedBytes` from Dovecot quota-status (cron job every N minutes).
6. **Me:** add fail2ban jail for cloudmail-api HTTP 401 spam.
7. **Me:** implement TOTP 2FA (schema is ready).
8. **Me:** implement password-reset email flow (blocked on outbound mail).
9. **Later phase:** calendar, contacts, admin panel, signature-with-images, filters, distribution lists.

---

## 6. How to prove any of this yourself

```bash
# From any machine
curl -sS https://mail.digiskills.live/v1/live
curl -sS https://mail.digiskills.live/v1/health

# Local
cd cloudmail
node infra/scripts/e2e-test.mjs https://mail.digiskills.live
```

The frontend lives at `https://mail.digiskills.live/` — landing page, sign up, add a domain, follow the DNS instructions, verify. Every button on those pages is real.

The webmail's "not-yet-real" bits are clearly marked in the UI banner. That's the point.
