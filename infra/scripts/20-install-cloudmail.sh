#!/usr/bin/env bash
# ─── Cloud Mail — full mail-server install on Ubuntu 22.04 ─────────
# Idempotent. Safe to re-run. Prints a summary at the end. Reads the deploy
# secrets from /etc/cloudmail/deploy.env which the operator populates once:
#
#   MAIL_HOST=mail.digiskills.live
#   ADMIN_EMAIL=admin@digiskills.live
#   DB_APP_PASSWORD=<generated once>
#   DB_POSTFIX_PASSWORD=<generated once>
#   DB_DOVECOT_PASSWORD=<generated once>
#   RSPAMD_CONTROLLER_PASSWORD=<generated once>
#   DOVECOT_MASTER_PASSWORD=<generated once>
#   JWT_ACCESS_SECRET=<hex 48>
#   JWT_REFRESH_SECRET=<hex 48>
#
# Nothing here writes secrets to logs. Nothing here talks to DNS or Hetzner.
# Firewall (UFW), fail2ban, TLS via certbot are configured explicitly.

set -euo pipefail
IFS=$'\n\t'

log() { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[install]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "must be run as root"
[[ -f /etc/cloudmail/deploy.env ]] || die "create /etc/cloudmail/deploy.env first (see comments)"
# shellcheck disable=SC1091
source /etc/cloudmail/deploy.env

for req in MAIL_HOST ADMIN_EMAIL DB_APP_PASSWORD DB_POSTFIX_PASSWORD DB_DOVECOT_PASSWORD RSPAMD_CONTROLLER_PASSWORD DOVECOT_MASTER_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  [[ -n "${!req:-}" ]] || die "missing $req in /etc/cloudmail/deploy.env"
done

log "Updating apt and installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  postgresql redis-server \
  postfix postfix-pgsql \
  dovecot-core dovecot-imapd dovecot-lmtpd dovecot-managesieved dovecot-pgsql dovecot-sieve \
  rspamd redis-tools \
  clamav clamav-daemon clamav-freshclam \
  certbot python3-certbot-nginx \
  nginx ufw fail2ban \
  build-essential ca-certificates gnupg curl

if ! command -v node >/dev/null || [[ "$(node -v | tr -d v | cut -d. -f1)" -lt 20 ]]; then
  log "Installing Node.js 20.x LTS from Nodesource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

log "Ensuring vmail user + Maildir root"
id -u vmail >/dev/null 2>&1 || useradd -r -u 5000 -s /usr/sbin/nologin -d /var/vmail vmail
install -d -o vmail -g vmail -m 0770 /var/vmail
install -d -o cloudmail -g cloudmail -m 0750 /var/lib/cloudmail /var/log/cloudmail 2>/dev/null || true
id -u cloudmail >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -m -d /var/lib/cloudmail cloudmail
install -d -o cloudmail -g cloudmail -m 0750 /var/lib/cloudmail /var/log/cloudmail

log "Configuring PostgreSQL: cloudmail DB + role"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cloudmail')       THEN CREATE ROLE cloudmail       LOGIN PASSWORD '${DB_APP_PASSWORD}'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cloudmail_postfix') THEN CREATE ROLE cloudmail_postfix LOGIN PASSWORD '${DB_POSTFIX_PASSWORD}'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='cloudmail_dovecot') THEN CREATE ROLE cloudmail_dovecot LOGIN PASSWORD '${DB_DOVECOT_PASSWORD}'; END IF;
END\$\$;
SELECT 'ok' WHERE EXISTS (SELECT FROM pg_database WHERE datname='cloudmail')
UNION ALL
SELECT 'created' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='cloudmail');
SQL
sudo -u postgres createdb -O cloudmail cloudmail 2>/dev/null || true
sudo -u postgres psql -d cloudmail -c "GRANT CONNECT ON DATABASE cloudmail TO cloudmail_postfix, cloudmail_dovecot;"

log "Writing /etc/cloudmail/api.env"
install -d -m 0750 -o cloudmail -g cloudmail /etc/cloudmail
umask 077
cat > /etc/cloudmail/api.env <<ENV
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=4000
PUBLIC_APP_URL=https://${MAIL_HOST}
PUBLIC_API_URL=https://${MAIL_HOST}
DATABASE_URL=postgresql://cloudmail:${DB_APP_PASSWORD}@127.0.0.1:5432/cloudmail?schema=public
REDIS_URL=redis://127.0.0.1:6379/0
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000
IMAP_HOST=127.0.0.1
IMAP_PORT=143
IMAP_SECURE=false
IMAP_STARTTLS=true
SMTP_SUBMISSION_HOST=127.0.0.1
SMTP_SUBMISSION_PORT=587
SMTP_SUBMISSION_SECURE=false
SMTP_SUBMISSION_STARTTLS=true
DOVECOT_MASTER_USER=cloudmail-api
DOVECOT_MASTER_PASSWORD=${DOVECOT_MASTER_PASSWORD}
CLOUDMAIL_INITIAL_MAIL_HOST=${MAIL_HOST}
CLOUDMAIL_INITIAL_IPV4=$(curl -s https://ipv4.icanhazip.com || echo "0.0.0.0")
UPLOAD_TMP_DIR=/var/lib/cloudmail/uploads
LOG_LEVEL=info
ENV
chown cloudmail:cloudmail /etc/cloudmail/api.env
chmod 0640 /etc/cloudmail/api.env
umask 022

log "Rendering Postfix Postgres map files with real password"
install -d -m 0755 /etc/postfix/pgsql
for f in virtual-domains virtual-mailboxes virtual-aliases sender-login-maps; do
  sed "s/REPLACED_BY_DEPLOY/${DB_POSTFIX_PASSWORD}/g" \
    /opt/cloudmail/current/infra/postfix/pgsql/${f}.cf \
    > /etc/postfix/pgsql/${f}.cf
  chmod 0640 /etc/postfix/pgsql/${f}.cf
  chown root:postfix /etc/postfix/pgsql/${f}.cf
done

log "Installing sudoers for cloudmail-user Postfix queue actions"
install -m 0440 -o root -g root \
  /opt/cloudmail/current/infra/systemd/cloudmail-mailq.sudoers \
  /etc/sudoers.d/cloudmail-mailq
# visudo -c validates every /etc/sudoers.d file — abort if malformed.
visudo -c -q -f /etc/sudoers.d/cloudmail-mailq || die "cloudmail-mailq sudoers failed validation"

log "Installing Postfix main.cf + master.cf entries"
cp /opt/cloudmail/current/infra/postfix/main.cf /etc/postfix/main.cf
if ! grep -q "^submission " /etc/postfix/master.cf; then
  cat /opt/cloudmail/current/infra/postfix/master.cf.additions >> /etc/postfix/master.cf
fi
sed -i "s|^myhostname.*|myhostname = ${MAIL_HOST}|"       /etc/postfix/main.cf
sed -i "s|^mydomain.*|mydomain = ${MAIL_HOST#mail.}|"     /etc/postfix/main.cf
postconf compatibility_level=3.6

log "Installing Dovecot config"
cp /opt/cloudmail/current/infra/dovecot/dovecot.conf              /etc/dovecot/dovecot.conf
sed "s/REPLACED_BY_DEPLOY/${DB_DOVECOT_PASSWORD}/g" \
   /opt/cloudmail/current/infra/dovecot/dovecot-sql.conf.ext > /etc/dovecot/dovecot-sql.conf.ext
chmod 0640 /etc/dovecot/dovecot-sql.conf.ext
chown root:dovecot /etc/dovecot/dovecot-sql.conf.ext

log "Configuring Dovecot master user for the API"
install -m 0640 -o root -g dovecot /dev/null /etc/dovecot/master-users
umask 077
# NOTE: use `doveadm pw -p <plaintext>` directly. The `-p /dev/stdin` variant
# mangles the input (reads a different string than what was piped) and produces
# a hash that no longer verifies against the original plaintext — a subtle
# footgun that silently breaks the API's master-user IMAP auth.
printf '%s:%s\n' \
  "cloudmail-api" \
  "$(doveadm pw -s ARGON2ID -p "${DOVECOT_MASTER_PASSWORD}")" \
  > /etc/dovecot/master-users
umask 022

log "Installing Rspamd config + controller password"
install -d /etc/rspamd/local.d /var/lib/rspamd/dkim
cp /opt/cloudmail/current/infra/rspamd/local.d/*.conf /etc/rspamd/local.d/
cp /opt/cloudmail/current/infra/rspamd/local.d/*.inc  /etc/rspamd/local.d/
sed -i "s|REPLACED_BY_DEPLOY|$(rspamadm pw -p ${RSPAMD_CONTROLLER_PASSWORD})|" /etc/rspamd/local.d/worker-controller.inc
chown -R _rspamd:_rspamd /var/lib/rspamd

log "Installing nginx vhost + issuing TLS via certbot"
cp /opt/cloudmail/current/infra/nginx/mail.digiskills.live.conf /etc/nginx/sites-available/${MAIL_HOST}
ln -sf /etc/nginx/sites-available/${MAIL_HOST} /etc/nginx/sites-enabled/${MAIL_HOST}
install -d /var/www/certbot
if [[ ! -d /etc/letsencrypt/live/${MAIL_HOST} ]]; then
  certbot certonly --webroot -w /var/www/certbot -d ${MAIL_HOST} \
    --agree-tos -m ${ADMIN_EMAIL} --non-interactive
fi
nginx -t && systemctl reload nginx

log "Firewall (UFW): allow SSH, HTTP, HTTPS, SMTP, submission, IMAPS, ManageSieve"
ufw default deny incoming
ufw default allow outgoing
for p in 22 25 80 443 465 587 993 4190; do ufw allow "$p"/tcp; done
yes | ufw enable

log "Enabling services"
systemctl enable --now postgresql redis-server postfix dovecot rspamd clamav-daemon clamav-freshclam nginx fail2ban

log "Installing systemd units for API + workers"
cp /opt/cloudmail/current/infra/systemd/cloudmail-api.service    /etc/systemd/system/
cp /opt/cloudmail/current/infra/systemd/cloudmail-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable cloudmail-api cloudmail-worker
systemctl restart cloudmail-api cloudmail-worker

log "Install complete."
log "  Web:   https://${MAIL_HOST}/"
log "  API:   https://${MAIL_HOST}/v1/health"
log "  IMAP:  ${MAIL_HOST}:993 (SSL/TLS)"
log "  SMTP:  ${MAIL_HOST}:587 (STARTTLS)"
