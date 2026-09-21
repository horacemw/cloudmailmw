#!/usr/bin/env bash
# ─── Cloud Mail — enable temporary SMTP relay for outbound mail ─────
#
# Reads relay credentials from /etc/cloudmail/deploy.env:
#
#   SMTP_RELAY_HOST=email-smtp.eu-west-1.amazonaws.com   # example — Amazon SES EU
#   SMTP_RELAY_PORT=587
#   SMTP_RELAY_USERNAME=AKIAxxxxxxxxxxxxxxxx              # provided by relay provider
#   SMTP_RELAY_PASSWORD=BM/xxxxxxxxxxxxxxxxxxxxxxxxxxx     # provided by relay provider
#   SMTP_RELAY_ENCRYPTION=starttls                        # "starttls" (587) or "tls" (465)
#   # Optional — envelope-from rewrite for providers that require it (e.g. SES):
#   SMTP_RELAY_ENVELOPE_FROM=noreply@mail.digiskills.live
#
# Idempotent — safe to re-run. Never logs credentials.
# Preserves inbound port-25 handling untouched.
#
# Rollback: /opt/cloudmail/current/infra/scripts/51-disable-smtp-relay.sh

set -euo pipefail
IFS=$'\n\t'

log() { printf '\033[1;34m[relay]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[relay]\033[0m %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run as root"

DEPLOY_ENV=/etc/cloudmail/deploy.env
[[ -f "$DEPLOY_ENV" ]] || die "$DEPLOY_ENV not found"

# shellcheck disable=SC1090
source "$DEPLOY_ENV"

for req in SMTP_RELAY_HOST SMTP_RELAY_PORT SMTP_RELAY_USERNAME SMTP_RELAY_PASSWORD; do
  [[ -n "${!req:-}" ]] || die "missing $req in $DEPLOY_ENV"
done

ENC="${SMTP_RELAY_ENCRYPTION:-starttls}"
case "$ENC" in
  starttls) WRAPPER=no ;;
  tls|smtps) WRAPPER=yes ;;
  *) die "SMTP_RELAY_ENCRYPTION must be 'starttls' or 'tls'";;
esac

log "Backing up current Postfix config"
BACKUP=/root/postfix-backup-$(date -u +%Y%m%dT%H%M%SZ).tar
tar -cf "$BACKUP" /etc/postfix 2>/dev/null || true
log "  backup: $BACKUP"

log "Writing /etc/postfix/sasl_passwd (0600 root:root)"
install -m 0600 -o root -g root /dev/null /etc/postfix/sasl_passwd
umask 077
printf '[%s]:%s %s:%s\n' \
  "$SMTP_RELAY_HOST" "$SMTP_RELAY_PORT" \
  "$SMTP_RELAY_USERNAME" "$SMTP_RELAY_PASSWORD" \
  > /etc/postfix/sasl_passwd
postmap /etc/postfix/sasl_passwd
chmod 0600 /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
umask 022

# Optional envelope-from rewrite (some providers require the SASL user
# to also appear in the SMTP envelope-from).
if [[ -n "${SMTP_RELAY_ENVELOPE_FROM:-}" ]]; then
  log "Writing /etc/postfix/generic for envelope-from rewrite"
  install -m 0644 -o root -g root /dev/null /etc/postfix/generic
  # Rewrite any @your-hostname envelope to the configured address.
  echo "/^.*$/ ${SMTP_RELAY_ENVELOPE_FROM}" > /etc/postfix/generic
  postmap /etc/postfix/generic
fi

log "Applying relay parameters with postconf -e"
postconf -e "relayhost=[${SMTP_RELAY_HOST}]:${SMTP_RELAY_PORT}"
postconf -e "smtp_sasl_auth_enable=yes"
postconf -e "smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd"
postconf -e "smtp_sasl_security_options=noanonymous"
postconf -e "smtp_sasl_tls_security_options=noanonymous"
postconf -e "smtp_sasl_mechanism_filter=plain, login"
postconf -e "smtp_use_tls=yes"
postconf -e "smtp_tls_security_level=encrypt"
postconf -e "smtp_tls_wrappermode=${WRAPPER}"
postconf -e "smtp_tls_CAfile=/etc/ssl/certs/ca-certificates.crt"
postconf -e "smtp_tls_loglevel=1"
if [[ -n "${SMTP_RELAY_ENVELOPE_FROM:-}" ]]; then
  postconf -e "smtp_generic_maps=hash:/etc/postfix/generic"
fi

log "Ensuring libsasl2-modules is installed (required for SASL PLAIN/LOGIN)"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libsasl2-modules >/dev/null 2>&1 || true

log "postfix check + reload"
postfix check
systemctl reload postfix

# Sanity — verify none of the fields ended up in logs.
if journalctl -u postfix -n 100 --no-pager 2>/dev/null | grep -qF "$SMTP_RELAY_PASSWORD"; then
  die "SECURITY: password appeared in postfix logs; refusing to continue"
fi

# Persist a marker so the health check can report we're in relay mode.
install -d /var/lib/cloudmail
echo "relay" > /var/lib/cloudmail/smtp_delivery_mode

log "Relay ENABLED."
log "  Direction: outbound only  |  Port 25 inbound: unchanged"
log "  Provider host : ${SMTP_RELAY_HOST}:${SMTP_RELAY_PORT}"
log "  Encryption    : ${ENC}"
log "  Envelope-from : ${SMTP_RELAY_ENVELOPE_FROM:-(unchanged)}"
log "  Backup        : ${BACKUP}"
log ""
log "Test with:  swaks --server 127.0.0.1 --port 587 --tls --auth PLAIN \\"
log "              --auth-user <mailbox> --auth-password <mailbox-pw> \\"
log "              --from <mailbox> --to <external-address>"
