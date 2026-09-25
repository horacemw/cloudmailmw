# Deliverability runbook

**Scope:** How to get mail sent from `mail.digiskills.live` (and any customer
domain routed through it) reliably into recipient Inboxes rather than Spam.

**Audience:** Operators of this MailCloud instance. Assumes SPF, DKIM, DMARC,
rDNS are already published (see checklist below).

---

## The uncomfortable truth about new mail servers

A brand-new sending IP and/or brand-new sending domain has **zero reputation**
at Gmail, Outlook, Yahoo, Apple, and every other major mailbox provider. Even
with perfect SPF+DKIM+DMARC alignment, they will spam-fold your first
messages by default. This is not a bug — it's an anti-abuse system doing
exactly what it's supposed to do against a signal it can't distinguish from a
fresh spam operation spinning up.

You cannot skip warm-up by "sending it correctly." You warm up by sending
predictably, at a slowly-increasing rate, to recipients who mark you Not Spam.

Expected timeline for a new IP/domain to reach reliable Inbox placement at
Gmail: **2–4 weeks** of consistent sending. Less if there's already a real
human on the receiving side rescuing messages from Spam.

---

## Prerequisites — the identity checklist (verify BEFORE warm-up)

Run each check. Every one must pass.

### 1. rDNS matches HELO

The sending IP must reverse-resolve to a name that matches the SMTP `HELO/EHLO`.
Postfix's `myhostname` should be the same string.

```bash
# The sending IP:
dig +short A mail.digiskills.live @1.1.1.1

# Its rDNS:
dig +short -x 167.233.22.55 @1.1.1.1
# Expect: mail.digiskills.live.

# Postfix's HELO name:
sudo postconf myhostname
# Expect: myhostname = mail.digiskills.live
```

If rDNS is wrong: change it in the Hetzner Cloud Console (Server → Networking
→ Reverse DNS).

### 2. SPF authorises the sending IP for every sending domain

Every domain that appears in a `MAIL FROM` on outbound mail needs an SPF
record whose evaluated result AUTHORISES the sending IP.

```bash
# For each customer domain:
dig +short TXT njingatracker.online @1.1.1.1
# Expect a v=spf1 record that resolves (via include: or ip4:) to include the sending IP
```

Recommended pattern for MailCloud-managed domains:

```
njingatracker.online.  TXT  "v=spf1 include:_spf.mail.digiskills.live -all"
_spf.mail.digiskills.live.  TXT  "v=spf1 ip4:167.233.22.55 ~all"
```

The nested `include:` means the customer's record never has to change if the
sending IP changes — only the platform's own `_spf` record.

### 3. DKIM key is published AND Rspamd is signing

Every sending domain needs a public key at `<selector>._domainkey.<domain>`
matching the private key stored in `/var/lib/rspamd/dkim/<domain>.<selector>.key`.

```bash
# On the server, key file exists:
sudo -u _rspamd ls -la /var/lib/rspamd/dkim/njingatracker.online.cm1.key

# In DNS, the public key is published:
dig +short TXT cm1._domainkey.njingatracker.online @1.1.1.1
# Expect: "v=DKIM1; k=rsa; p=<base64>..."

# Rspamd milter is wired to Postfix (both directions):
sudo postconf smtpd_milters non_smtpd_milters
# Expect: both to point at inet:127.0.0.1:11332

# Actually verify signing by sending a probe:
node apps/api/scripts/deliverability-probe.mjs
# See the "Scoring" section below.
```

If a customer adds a new domain, MailCloud's onboarding flow generates the
key and shows them the DNS record to publish. Signing does NOT begin until
Rspamd sees the key file with the correct name/perms.

### 4. DMARC is published

Start at `p=none` for a fresh domain (monitor-only). Move to `p=quarantine`
once you have a week of clean DMARC reports. Move to `p=reject` only after
several weeks with 100% pass rate.

```
_dmarc.njingatracker.online.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@njingatracker.online; adkim=r; aspf=r"
```

Where `dmarc-reports@…` is a real mailbox you'll actually monitor. Aggregate
reports arrive daily from major receivers; they're XML dumps of pass/fail
counts per sending source. If you see fails from unexpected IPs, that's
either legitimate mail you forgot about (fix your SPF) or someone spoofing
your domain (that's what DMARC is *for*).

### 5. TLS chain is intact

`openssl s_client -starttls smtp -connect mail.digiskills.live:587
-servername mail.digiskills.live </dev/null 2>&1 | openssl x509 -noout
-subject -dates`

Cert should be issued for the HELO name, not expired.

---

## Scoring your setup

**mail-tester.com** is the fastest external audit. Free tier gives 3 tests
per day. Each test issues a random `<uid>@srv1.mail-tester.com` address —
you send ONE message from your sending identity to that address, then visit
`https://www.mail-tester.com/<uid>` to see your score out of 10.

There's a helper script bundled with this repo:

```bash
# On the server, as cloudmail:
sudo -u cloudmail bash -c 'cd /opt/cloudmail/current/apps/api && \
  set -a && source /etc/cloudmail/api.env && set +a && \
  node scripts/deliverability-probe.mjs info@njingatracker.online'

# It will prompt you for the mail-tester recipient (paste the address
# from mail-tester.com), send one probe, then print the results URL.
```

**Target score:** 9/10 or better. Anything less is an authentication
problem, not a warm-up problem — go back to the checklist above.

The specific things mail-tester scores you on:
- `1.5` — SPF pass + alignment (both `Return-Path` domain and `From` domain
  align, and the sending IP is authorised).
- `1.5` — DKIM signature valid, domain matches `From`, signature covers
  header (relaxed/relaxed is fine).
- `1.5` — DMARC record present + policy matches actual alignment.
- `1.5` — reverse DNS + HELO consistent.
- ~4.0 — spam-word content, HTML/text balance, image/text ratio, unsubscribe
  header, list-unsubscribe, etc.

If DKIM/SPF/DMARC/rDNS score below `5.5` combined, DO NOT start warm-up.
Fix the identity layer first.

---

## Warm-up plan (a concrete schedule that works)

The single most important rule: **send predictably**. A spike from 0 to 500
messages a day looks exactly like a compromised host to Gmail. A slow ramp
where daily volume grows monotonically looks like an actual business.

### Day 1 → Day 7 (Week 1) — "prove humans want to hear from you"

- **Volume:** ≤ 20 messages/day total, across all customer domains combined.
- **Recipients:** People who ACTUALLY WANT the mail and will ACT on it —
  open, reply, click, mark Not Spam if it lands in Spam. That last one is
  gold. A single Not-Spam mark from an engaged Gmail user teaches Gmail's
  classifier more than 100 correctly-authenticated cold messages.
- **Content:** Plain-text or minimal HTML. No images, no attachments >100KB,
  no marketing-shaped subject lines ("SALE!!!", "FREE"), no URL shorteners
  (`bit.ly`, `tinyurl`), no unfamiliar-domain links.
- **From/To:** Same From address for repeated sends — receivers score
  reputation per From, not just per domain.

### Week 2 — "gradual"

- **Volume:** ≤ 50/day. Still real recipients.
- Watch DMARC reports (`rua=`) daily. Any fails from your own IP mean the
  chain is broken — stop and fix.

### Week 3 — "expand"

- **Volume:** ≤ 200/day.
- Introduce more sending mailboxes. Each new sender (mailbox) starts small
  and grows the same way — reputation is per-sender not just per-domain.

### Week 4 — "monitor & tighten"

- **Volume:** ≤ 500/day.
- If Gmail placement is now Inbox, tighten DMARC from `p=none` to
  `p=quarantine`. Give it another week.

### Week 5+ — "cruise"

- **Volume:** whatever the business needs, as long as daily variance stays
  within ±50% of trailing average. Sudden 10x spikes = temporary spam-fold.
- Move DMARC to `p=reject` once you're confident zero legitimate mail comes
  from any source you haven't SPF-authorised.

### Anti-patterns that will kill warm-up

- **Sending to purchased lists.** Guarantees hard bounces and spam
  complaints, which are the two signals that most-quickly reset reputation
  to negative.
- **Sudden weekend/holiday spikes.** A quiet mailbox that suddenly sends
  10x its normal daily volume is a compromised-host signature.
- **Rotating From addresses to "avoid spam."** Actually accelerates the
  spam-fold — receivers correlate on the domain regardless.
- **Using a new sending IP mid-warmup.** Reputation is per-IP AND per-domain.
  A new IP with an old domain restarts the IP portion of reputation.

---

## Monitoring in production

### Daily

```bash
# Postfix queue depth — anything above 50 in queue is a bad sign
sudo -u cloudmail bash -c 'cd /opt/cloudmail/current/apps/api && node -e "
import(\"./dist/routes/admin.js\").then(() => {})" 2>&1
# OR just:
sudo mailq | tail -1
```

- Check `mailq` daily. Anything sitting >30min means a specific receiver is
  deferring you — that's a targeted reputation problem with that provider.
- Read your DMARC `rua=` mailbox. XML reports arrive daily.

### Weekly

- Run `deliverability-probe.mjs` and record the mail-tester score. A drop
  from 9→7 is the earliest signal of a reputation slide.
- Check `journalctl -u postfix --since "1 week ago" | grep -E "deferred|bounced"`
  for volume trends.

### On symptom (customer says "my mail is going to spam")

1. Run the probe (`deliverability-probe.mjs`).
2. If score >= 9: the receiver is doing bayesian spam classification against
   the CONTENT, not the identity. Ask the recipient to mark Not Spam once —
   that trains their side. Nothing on our end will fix this.
3. If score < 9: it's an identity problem. Compare to the "Prerequisites"
   checklist section by section and fix whatever regressed.

---

## Escape hatches

- **A specific receiver (e.g. Gmail) is spam-folding us and we need help
  fast:** postmaster.google.com/managetraffic/dashboard lets you register as
  a sender and see specific reputation signals for your IP + domain. Requires
  ≥ ~few-hundred messages/day to that receiver before data appears.

- **We got listed on a blocklist (Spamhaus, Barracuda, etc.):** each list
  has its own delisting flow. Fix the underlying issue first (open relay,
  compromised account, botnet activity), then request delisting. Do NOT
  request delisting for a still-broken host — you'll get relisted immediately
  and second-strike delisting is much harder.

- **We need to switch sending IPs:** treat the new IP as a fresh warm-up.
  Announce it in advance via SPF `include:` so receivers see the intent.
  Old IP stays live for 30 days as a fallback.

---

## Where things are configured

| Component | Path | Notes |
|---|---|---|
| Postfix main | `/etc/postfix/main.cf` | `myhostname`, `smtpd_milters`, `mynetworks` |
| Postfix master | `/etc/postfix/master.cf` | submission on 587 |
| Rspamd DKIM signing | `/etc/rspamd/local.d/dkim_signing.conf` | `use_esld=false` so per-subdomain keys resolve |
| DKIM private keys | `/var/lib/rspamd/dkim/<domain>.<selector>.key` | 0640 root:_rspamd |
| Rspamd worker-proxy (milter) | `/etc/rspamd/local.d/worker-proxy.inc` | listens 127.0.0.1:11332 |
| Rspamd controller | `/etc/rspamd/local.d/worker-controller.inc` | web UI on :11334 with password |
| Dovecot | `/etc/dovecot/dovecot.conf` | virtual users via SQL (passdb queries `mailboxes` table) |
| Deploy env | `/etc/cloudmail/api.env` | `PLATFORM_ADMIN_REQUIRE_MFA`, `MAILBOX_PURGE_RETENTION_DAYS`, JWT secrets |
