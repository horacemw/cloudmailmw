#!/usr/bin/env bash
# ─── Cloud Mail — revert to DIRECT SMTP delivery ────────────────────
# Use this once Hetzner has approved outbound port 25 and you want to
# stop using the relay.
#
# Idempotent. Preserves inbound handling.

set -euo pipefail
log() { printf '\033[1;34m[relay:disable]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[relay:disable]\033[0m %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run as root"

log "Backing up current Postfix config"
BACKUP=/root/postfix-backup-$(date -u +%Y%m%dT%H%M%SZ).tar
tar -cf "$BACKUP" /etc/postfix 2>/dev/null || true

log "Clearing relayhost + SASL auth (postconf -e)"
postconf -e "relayhost="
postconf -e "smtp_sasl_auth_enable=no"
postconf -# smtp_sasl_password_maps    # remove parameter entirely
postconf -# smtp_sasl_security_options
postconf -# smtp_sasl_tls_security_options
postconf -# smtp_sasl_mechanism_filter
postconf -# smtp_tls_wrappermode
postconf -# smtp_generic_maps

log "Removing sasl_passwd files"
rm -f /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
rm -f /etc/postfix/generic /etc/postfix/generic.db

postfix check
systemctl reload postfix

echo "direct" > /var/lib/cloudmail/smtp_delivery_mode 2>/dev/null || true
log "Direct delivery restored. Backup: ${BACKUP}"
