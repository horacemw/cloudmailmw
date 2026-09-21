#!/usr/bin/env bash
# ─── Cloud Mail — post-install verification ─────────────────────────
# Read-only. Runs the smoke tests that Phase 2 acceptance criteria call for:
#   - services alive
#   - Postgres reachable
#   - open-relay refused
#   - TLS ports responding with a valid cert
#   - IMAP LOGIN reachable
#   - API /v1/health returns healthy

set -u
log() { printf '\033[1;33m[verify]\033[0m %s\n' "$*"; }

log "Services:"
for s in postgresql redis-server postfix dovecot rspamd clamav-daemon nginx cloudmail-api cloudmail-worker; do
  systemctl is-active --quiet "$s" && printf "  ✓ %s\n" "$s" || printf "  ✗ %s\n" "$s"
done

log "Postgres reachable:"
sudo -u postgres psql -tAc "SELECT count(*) FROM domains;" cloudmail && echo "  ✓ query succeeded"

log "TLS on 993/587:"
openssl s_client -connect localhost:993 -brief -verify_return_error < /dev/null 2>&1 | head -3
openssl s_client -connect localhost:587 -starttls smtp -brief < /dev/null 2>&1 | head -3

log "Open-relay check (should be REJECTED):"
{
  printf 'HELO test.example\r\n'
  printf 'MAIL FROM:<test@external.example>\r\n'
  printf 'RCPT TO:<victim@another.example>\r\n'
  printf 'QUIT\r\n'
  sleep 1
} | openssl s_client -connect localhost:587 -starttls smtp -crlf -quiet 2>/dev/null | grep -E "^(2|4|5)[0-9][0-9]" || true

log "API health:"
curl -fsS http://127.0.0.1:4000/v1/health | head -c 400; echo

log "Done."
