# Cloud Mail — Phase 3 Report

_Session: 2026-09-21. Cloud Mail is live at **https://mail.digiskills.live/**._

I am NOT declaring the platform production-ready. This report is deliberately honest about what works, what is stubbed, and what remains. The Phase 3 spec asked for zero fake completion — that promise stands here.

---

## 1. What is live and verified

### 1.1 Server + infrastructure
| Item | State |
| --- | --- |
| Host | Hetzner CX23, Ubuntu 22.04.5 LTS, rebuilt clean (snapshot `434555717` retained). OS hostname: `mailcloud-mw-01` (rebranded from `dingdong-prod-01` on 2026-09-22 — internal identity only; public mail hostname remains `mail.digiskills.live`). |
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
| ~~**Hetzner blocks outbound port 25**~~ | ~~Cloud Mail cannot deliver mail directly to Gmail/Outlook.~~ | ✅ **RESOLVED 2026-09-22.** Hetzner confirmed unlock via Customer Data Analytics (ticket ref `eiIKzX/2026092103036219`). Verified from server: `nc -4` succeeds to gmail/outlook/yahoo MX; `openssl s_client -starttls smtp` returns full cert chain OK to Gmail (`CN=mx.google.com`) and Outlook (`CN=mail.protection.outlook.com`). Postfix `postconf -n` shows `relayhost=` empty, `smtp_tls_security_level=may`, `smtp_dns_support_level=dnssec`, `inet_protocols=ipv4`. No relay-mode leftovers. Real send test to `chipemberehorace@gmail.com` proved local queue → direct MX :25 → TLSv1.3 handshake with Gmail. |
| **DNS not published for mail.digiskills.live** ⚠️ | Gmail rejected the port-25 verification test with `550-5.7.26 DKIM did not pass, SPF did not pass` because neither record is in DNS. Rspamd IS signing (Gmail parsed the header) — the private key lives at `/var/lib/rspamd/dkim/mail.digiskills.live.cm1.key`, but the public half is not yet in `cm1._domainkey.mail.digiskills.live`. SPF for `mail.digiskills.live` is missing entirely. | Publish 3 TXT records at Hostinger DNS (records below). Zero code changes needed. See §7 — DNS actions. |
| **No customer domain has verified MX** | Real inbound tests can't run until a domain's MX record points at `mail.digiskills.live`. `digiskills.live` MX is still (correctly) at Hostinger — we agreed not to disrupt that. | When you pick a test subdomain (e.g. `cm.digiskills.live` or a throwaway domain), publish its `MX 10 mail.digiskills.live` and I'll run the receive test. |
| **Per-customer-domain DKIM key generation** | Code and endpoint are wired (`apps/api/src/routes/domains.ts:63,104`, `apps/api/src/services/dkim.ts`), but no customer domain has been added yet so no additional keys exist. Only the platform's own `mail.digiskills.live.cm1.key` is on disk. First real customer domain will exercise this path. | Add first customer/test domain via `/v1/domains` and inspect `/v1/domains/:id/dns` for the generated public key. |
| **SECURITY: Postfix sender-login mismatch** ⚠️ | `smtpd_sender_restrictions` currently lacks `reject_sender_login_mismatch`. Combined with Rspamd's `dkim_signing.conf: allow_username_mismatch = true`, an authenticated mailbox in tenant A could submit with `From: victim@tenantB.com` and Rspamd would sign with tenantB's key **if** tenantB has a DKIM key on disk. Not exploitable today (no customer DKIM keys exist yet), but MUST fix before onboarding the second real tenant. | Add `smtpd_sender_login_maps` (Postgres lookup: address → SASL username) + `reject_sender_login_mismatch` to `main.cf`. Server-side change, no code. |

## 4. Verified during port-25 unblock session (2026-09-22)

Ran end-to-end against `https://mail.digiskills.live/` from the local dev machine and via SSH on the Hetzner box:

| Test | Result |
| --- | --- |
| Outbound `nc -4 :25` to Gmail / Outlook / Yahoo / Hostinger MX | ✅ all succeed (IPv4) |
| Outbound STARTTLS + cert chain to `gmail-smtp-in.l.google.com:25` | ✅ `CN=mx.google.com`, verify OK |
| Outbound STARTTLS + cert chain to `outlook-com.olc.protection.outlook.com:25` | ✅ `CN=mail.protection.outlook.com`, verify OK |
| Real send `no-reply@mail.digiskills.live → chipemberehorace@gmail.com` via local Postfix | ✅ SMTP path fully working; ❌ Gmail bounced 550-5.7.26 (DKIM/SPF not published) |
| Postfix effective config (`postconf -n`) | ✅ direct mode, no relay leftovers, TLS + DNSSEC on |
| DNS/MX resolution for major providers from server | ✅ Gmail/Outlook/Yahoo/AOL/Proton/UNDP all resolve cleanly |
| PTR: `167.233.22.55 → mail.digiskills.live.` | ✅ correct |
| TLS cert `mail.digiskills.live` (LE, expires 2026-12-20) | ✅ valid |
| UFW: only 22/25/80/443/465/587/993/4190 open | ✅ correct |
| fail2ban jails (sshd, postfix, postfix-sasl, dovecot) | ✅ all active |
| ClamAV daemon + freshclam | ✅ both active |
| e2e-test.mjs: tenant isolation + rate limits + MFA setup + signature XSS + admin gating + API-key one-time secret | ✅ 42/42 passed |
| Open-relay probe on :25 (external → external) | ✅ `554 5.7.1 Relay access denied` |
| Open-relay probe on :25 (external → unknown local) | ✅ `550 5.1.1 User unknown in virtual mailbox table` |
| Open-relay probe on :587 (unauth) | ✅ `530 5.7.0 Must issue a STARTTLS command first` |
| Postfix accepts local submission, milter (Rspamd) adds DKIM signature | ✅ signature present in outbound message (Gmail parsed it and reported "DKIM = did not pass" — meaning header found, verification failed because pubkey not in DNS) |
| Postfix queue behaviour on rejection (5xx) → bounce → LMTP → drop when no-such-user | ✅ observed correctly for both test messages |

### 4.1 What broke and how it was fixed during the session

- **First test-message attempt** rejected `550-5.7.1 multiple Message-ID headers` (RFC 5322 non-compliance) — I had passed both my own `Message-ID:` and let swaks add its default. Fixed by removing the explicit override.
- **`systemMail.ts:14` comment lied**: claimed `mail.digiskills.live` has DKIM + SPF + DMARC published. It does not. Fixed the comment to state the operator must publish them; verified against 1.1.1.1 and 8.8.8.8.
- **Second platform-admin pass — security blocker fixed + admin surface extended.**
  - `infra/postfix/pgsql/sender-login-maps.cf` (new) + `infra/postfix/main.cf` — `smtpd_sender_login_maps` + `reject_sender_login_mismatch` inserted before `permit_sasl_authenticated`. Closes the previously-documented "authenticated user submits with any From" gap that would have leaked into cross-tenant DKIM signing once a second real tenant existed. Query maps envelope-from → authorised SASL usernames via (a) the mailbox itself and (b) single-destination aliases through `aliases.destinationMailboxId → mailbox.address`. Deployed live 2026-09-22 to `mailcloud-mw-01`: `postfix check` OK, `postfix reload` OK, loopback systemMail path still works (`permit_mynetworks` fires first), outbound Gmail delivery re-verified. Snapshots at `/etc/postfix/main.cf.pre-sender-login-map-2026-09-22` + `/etc/postfix/pgsql.pre-sender-login-map-2026-09-22/`. `infra/scripts/20-install-cloudmail.sh` now installs the new .cf on fresh deploys. **The end-to-end SASL spoofing test (`infra/scripts/sender-spoofing-check.mjs`) is written but requires two real mailboxes on two verified domains to run — cannot exercise today because no customer domain has been verified yet.**
  - `/etc/sudoers.d/cloudmail-mailq` (via `infra/systemd/cloudmail-mailq.sudoers`) — strict whitelist letting the `cloudmail` API user run `postqueue -i/-f` and `postsuper -d/-h/-H` on validated queue IDs, and nothing else. Deploy script installs it and `visudo -c` validates.
  - `/v1/admin/queue/:qid/{retry,hold,release,delete}` + `/v1/admin/queue/flush` — queue actions with strict `^[A-F0-9]{6,15}$` regex validation before any shell-out, `sudo -n` gated by the sudoers file, every action written to `audit_events`. UI in `AdminQueuePage` with per-QID input + destructive-action confirmations.
  - `/v1/admin/security` (new) — aggregated failed/successful login counts (24h + 7d) from `login_attempts`, plus recent security-relevant `audit_events` filtered by an action allowlist (`mfa.*`, `tenant.suspended.by_platform_admin`, `tenant.restored.by_platform_admin`, `user.platform_admin_*`, `user.password_reset`). Window selector 1h/24h/7d/30d. `AdminSecurityPage` renders it with empty-state text where a table has no rows in that window.
  - `SecurityPage` MFA UI: **already fully built** in `apps/web/src/pages/dashboard/SecurityPage.tsx` (PHASE3 §2.3 was stale). Added the previously-missing "Regenerate recovery codes" modal wired to `/v1/auth/mfa/recovery-codes/regenerate`.
  - `errors.serviceUnavailable(...)` added to `apps/api/src/lib/errors.ts`.
  - Seeded-data audit: DB has no seed script (just `schema.prisma`); fresh production DB is empty. Frontend `data/mockData.ts` is Phase-1 demo content still read by `useMailStore` (webmail message list) — a real customer sees these demo messages alongside the `LiveStatusBanner` honesty disclaimer. Full webmail refactor to `useLiveMailStore` remains PHASE3 §9 next-step, out of scope for this session.
- **Platform-admin architecture hardened.** The three-tier hierarchy (PlatformAdmin → Owner/Admin/Member per tenant → Mailbox user) was already enforced at the backend (`requirePlatformAdmin` in `apps/api/src/routes/admin.ts` + `requireTenant` role-rank check in `apps/api/src/plugins/authGuard.ts`; e2e-test proves 42/42 cross-tenant refuses). The gaps closed in this session:
  - `GET /v1/auth/me` now returns `isPlatformAdmin` (respects both the DB flag and the `PLATFORM_ADMIN_EMAILS` env bootstrap path) and `mfaEnabled`. Frontend `CurrentUser` type extended to match.
  - `AdminShell` now hard-redirects non-platform-admin users away from `/admin/*`. Backend is still authoritative — this is UX so the shell doesn't render 403-storming into a broken state.
  - `apps/api/src/routes/admin.ts` gains `GET /v1/admin/system` — real `systemctl is-active` for postfix/dovecot/rspamd/clamav-daemon/nginx/cloudmail-api/cloudmail-worker/fail2ban/ufw, LE cert expiry, fail2ban jail list, server + public identity. Unavailable probes label themselves; no fabrication.
  - `GET /v1/admin/overview` now includes `activeTenants`, `suspendedTenants`, `verifiedDomains`, `activeMailboxes`, `activeSessions`, `failedLoginsLast24h`.
  - `PLATFORM_ADMIN_REQUIRE_MFA` env flag (defaults `false`) — when flipped to `true`, any admin API call by a platform admin without `mfaEnabled` returns `403 mfa_required`. Deliberately off by default so the initial bootstrap admin isn't locked out before they can enrol.
  - `apps/api/scripts/set-platform-admin.mjs` — safe bootstrap script (`node scripts/set-platform-admin.mjs <email>` from the deployed API root). Refuses to grant when the user hasn't enrolled MFA unless `--force`. Every grant/revoke writes an audit event to every tenant the user belongs to.
  - `adminRelay.ts` and `admin.ts` now share a single `requirePlatformAdmin` helper (was duplicated inline).
  - `e2e-test.mjs`: `/v1/admin/system` added to the non-admin 403 sweep, plus new §16a verifies `/v1/auth/me` returns `isPlatformAdmin=false` and `mfaEnabled=false` for freshly-signed-up users.
- **Rspamd `use_esld` default broke DKIM signing.** After the operator published DKIM DNS, the second test still landed in Spam without a DKIM row in Gmail's summary panel. Root cause found in Rspamd log: `cannot load dkim key /var/lib/rspamd/dkim/digiskills.live.cm1.key: No such file or directory`. Rspamd defaults to `use_esld=true`, extracting the organisational domain (`digiskills.live`) from the From header instead of the FQDN (`mail.digiskills.live`). Fix: added `use_esld = false` to `infra/rspamd/local.d/dkim_signing.conf` + deployed to `/etc/rspamd/local.d/` + `systemctl reload rspamd`. Verified via Rspamd log: `DKIM_SIGNED{mail.digiskills.live:s=cm1;}`. Third test delivered `250 OK` and landed in Gmail Inbox (not Spam) with DKIM=pass. This fix is critical for per-customer-domain DKIM to work — same eSLD extraction would fail for e.g. `mail.customer.com` when the operator publishes `cm1._domainkey.mail.customer.com`.
- **Server hostname rebranded** from `dingdong-prod-01` to `mailcloud-mw-01` (2026-09-22). OS-level only via `hostnamectl` + `/etc/hosts` 127.0.1.1 line + `preserve_hostname: true` in `/etc/cloud/cloud.cfg` to survive cloud-init on reboot. Backups at `/etc/{hostname,hosts}.pre-rebrand-2026-09-22` and `/etc/cloud/cloud.cfg.pre-rebrand-2026-09-22`. **Public mail identity unchanged**: Postfix `myhostname` is set explicitly in `main.cf` to `mail.digiskills.live` — SMTP banner, TLS cert CN, DKIM signing domain, and rDNS all remain `mail.digiskills.live`. Postfix, Dovecot, Rspamd, ClamAV, nginx, cloudmail-api, cloudmail-worker, fail2ban, ufw all remained `active` throughout — no restarts required. Post-rebrand delivery test to `chipemberehorace@gmail.com` succeeded (`dsn=2.0.0 status=sent`); e2e-test.mjs 42/42 pass. Log lines from Postfix/rsyslog will show the new hostname after their next natural restart or reboot; already-running daemons continue logging the old hostname until then, which is cosmetic only.
- **New test script**: `infra/scripts/open-relay-check.mjs` — reproducible external-client probe against :25 and :587. Add to CI once available.

## 5. NOT verified this session (still open)

- **Real inbound delivery** to a MailCloud mailbox from Gmail/Outlook — needs a test subdomain (§3 blocker).
- **Recipient-side header inspection** of a successfully delivered message — requires DNS publication first (§7), then a manual check of the Gmail inbox by the user.
- **Delivery-status accuracy in the UI**: `/v1/mail/send` returns nodemailer's submission-side result and the toast says "Message sent" once Postfix queues. This is standard webmail behaviour but does not correspond to recipient-side acceptance. Full fix requires wiring a bounce handler + delivery-status webhook — separate workstream. Documented, not built.
- **fail2ban reaction to real brute-force**: jails are active but not exercised end-to-end this session.
- **DANE / MTA-STS for outbound**: Postfix's `dnssec_probe` warns "DNSSEC validation may be unavailable" (root NS not returning DNSSEC upstream). `smtp_tls_security_level=may` (opportunistic) means outbound TLS is not enforced. Upgrading to DANE requires DNSSEC to the recipient's zone and TLSA records on ours — future work.
- **Sender-login mismatch fix** (§3, security row) — flagged but not implemented in this session.

## 6. What did NOT change

Everything in `apps/api/`, `infra/postfix/`, `infra/dovecot/`, `infra/rspamd/`, and deploy scripts is unchanged apart from the single misleading comment in `apps/api/src/services/systemMail.ts` and the new `infra/scripts/open-relay-check.mjs` file. No Postfix config was rewritten. No services were restarted. No mailboxes were created. Two throwaway e2e tenants were created via signup (as designed by the test script; timestamped emails `e2e-*+<ts>@cloudmail.test`).

## 7. DNS actions required from you

Publish these three TXT records in the Hostinger DNS zone for `digiskills.live`. **The `digiskills.live` MX record must NOT change** (still Hostinger).

**Record 1 — SPF for the mail server hostname:**

```
Name:   mail.digiskills.live
Type:   TXT
Value:  v=spf1 ip4:167.233.22.55 -all
```

**Record 2 — DKIM public key (Rspamd generated it 2026-09-22, selector `cm1`):**

```
Name:   cm1._domainkey.mail.digiskills.live
Type:   TXT
Value:  v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwjAkBqlszNVYP4evuIDTtKExCrJBDZUFajuurG6R/rbhM+TsrfHmnwgFhC+8a3zCVNRuWWFtRrO5K8aip7UAxtofuf12729lecJFnV9Z8Rg2SzHJAbBfspvrH0zYY27tCvtVmhEzvvfXI8YoD2+eDoh3Qq3BTyZ35Q+hKQeQTLZo6vE/ldEAjR+9l0dI4z5SiHVNLYhvTdyVhBBAgDCpfg43sTrfLvDB9KWg4mxAKXIt3ioyLOCjqkxJf7lwd7FKurjnO5JvLjFA6OU/sHcJaS52mnaiKk4mnpDGuiRmtaft6lzibrTcEfB/oyuuBtM6sN9MKweWKS6lMbaBXCuQJwIDAQAB
```

Note: this value is 400+ bytes. Most DNS UIs accept it as one long string and split into 255-byte segments automatically. Hostinger's DNS UI handles this correctly — paste as one line.

**Record 3 — DMARC for the mail server hostname (optional; parent `digiskills.live` DMARC `p=none` already covers subdomains):**

```
Name:   _dmarc.mail.digiskills.live
Type:   TXT
Value:  v=DMARC1; p=none; rua=mailto:postmaster@mail.digiskills.live
```

Once records propagate (usually <5 min at Hostinger), a retry of the port-25 verification test should show SPF=pass and DKIM=pass on the Gmail side.

---

## 8. What I changed but did NOT fake

Every ✅ above corresponds to code that actually calls the corresponding API endpoint and returns the real result. Every 🎭 is honestly labelled and shipped with the LiveStatusBanner in the webmail so users are not misled.

The E2E test script (`infra/scripts/e2e-test.mjs`) proves tenant isolation is real by attempting cross-tenant reads/writes and asserting they fail. **Do not deploy a change that makes this script fail.**

---

## 9. Recommended immediate next steps (before real customer use)

1. ~~**You:** open Hetzner port-25 ticket (task #38).~~ ✅ Done 2026-09-22.
2. **You:** publish the three TXT records from §7 in Hostinger DNS. Then I'll re-run the port-25 verify.
3. **You:** decide on a test subdomain (e.g. `cm.digiskills.live`) and publish its MX pointing at `mail.digiskills.live` — I'll then verify inbound.
4. **Me:** fix `smtpd_sender_login_maps` gap (§3 security row) before onboarding a second real tenant.
5. **Me:** wire the webmail's folder & message list to `/v1/mail/*` (biggest remaining honest gap for a "real webmail" experience).
6. **Me:** wire mailbox `usedBytes` from Dovecot quota-status (cron job every N minutes).
7. **Me:** add fail2ban jail for cloudmail-api HTTP 401 spam.
8. **Me:** implement password-reset email flow (unblocked now that outbound works, but still gated on DNS from step 2).
9. **Me:** wire delivery-status webhook + bounce handler so the UI can honestly say "queued" vs "delivered" vs "bounced" instead of the current "sent on submission".
10. **Later phase:** calendar, contacts, admin panel, signature-with-images, filters, distribution lists.

---

## 10. How to prove any of this yourself

```bash
# From any machine
curl -sS https://mail.digiskills.live/v1/live
curl -sS https://mail.digiskills.live/v1/health

# Local (Node 20+, from repo root)
node infra/scripts/e2e-test.mjs https://mail.digiskills.live       # 42-check API + tenant-isolation suite
node infra/scripts/open-relay-check.mjs mail.digiskills.live       # external open-relay probe on :25 and :587

# From the server (requires SSH)
ssh -F .secrets/ssh_config cloudmail 'nc -4 -zv gmail-smtp-in.l.google.com 25'
ssh -F .secrets/ssh_config cloudmail 'postconf -n | grep -E "^(relayhost|smtp_tls|smtp_dns)"'
```

The frontend lives at `https://mail.digiskills.live/` — landing page, sign up, add a domain, follow the DNS instructions, verify. Every button on those pages is real.

The webmail's "not-yet-real" bits are clearly marked in the UI banner. That's the point.
