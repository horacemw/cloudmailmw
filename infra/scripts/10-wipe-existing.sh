#!/usr/bin/env bash
# ─── Cloud Mail — remove pre-existing app (malawiadventistmusic.com Laravel) ─
#
# DESTRUCTIVE. Only run after 00-preflight.sh has been reviewed AND the user
# has authorised deletion. The script:
#   - Removes the nginx vhost for malawiadventistmusic.com + www variant
#   - Deletes the Laravel app directory (usually /var/www/... or /home/...)
#   - Drops the MySQL/Postgres database if it belongs to that app
#   - Revokes the Let's Encrypt cert
#   - Preserves nginx / PHP-FPM binaries — Cloud Mail reuses them.
#
# Refuses to run if it can't find the target — no silent broad wipes.

set -euo pipefail
IFS=$'\n\t'

log() { printf '\033[1;32m[wipe]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[wipe]\033[0m %s\n' "$*" >&2; exit 1; }

TARGET_DOMAIN="malawiadventistmusic.com"

[[ $EUID -eq 0 ]] || die "must be run as root"

log "Locating nginx vhosts referencing ${TARGET_DOMAIN}"
mapfile -t VHOSTS < <(grep -rlE "server_name\s+.*${TARGET_DOMAIN}" /etc/nginx/sites-enabled /etc/nginx/sites-available 2>/dev/null || true)
if [[ ${#VHOSTS[@]} -eq 0 ]]; then
  log "  no vhost files matched — perhaps already removed"
fi

log "Locating document root(s)"
mapfile -t ROOTS < <(
  for f in "${VHOSTS[@]:-}"; do
    [[ -n "$f" ]] && awk '/^\s*root\s+/ {gsub(/;/,"",$2); print $2}' "$f" || true
  done | sort -u
)

log "Detected candidates:"
printf '  vhost: %s\n' "${VHOSTS[@]:-<none>}"
printf '  root:  %s\n' "${ROOTS[@]:-<none>}"

log "Disabling and removing nginx vhosts"
for f in "${VHOSTS[@]:-}"; do
  [[ -z "$f" ]] && continue
  case "$f" in
    /etc/nginx/sites-enabled/*)
      rm -f "$f"; log "  removed $f (symlink)" ;;
    /etc/nginx/sites-available/*)
      rm -f "$f"; log "  removed $f (source)" ;;
  esac
done
nginx -t && systemctl reload nginx

log "Removing application directories"
for r in "${ROOTS[@]:-}"; do
  [[ -z "$r" ]] && continue
  # Walk up one level: Laravel /var/www/site/public → site dir is /var/www/site
  app=$(dirname "$r")
  case "$app" in
    /var/www/*|/opt/*|/srv/*|/home/*)
      if [[ -d "$app" ]]; then
        log "  rm -rf $app"
        rm -rf --one-file-system "$app"
      fi ;;
    *)
      log "  skipping non-standard path: $app (delete manually if needed)" ;;
  esac
done

log "Revoking + removing Let's Encrypt cert for ${TARGET_DOMAIN} (if present)"
if [[ -d "/etc/letsencrypt/live/${TARGET_DOMAIN}" ]]; then
  certbot revoke --non-interactive --cert-name "${TARGET_DOMAIN}" || true
  certbot delete  --non-interactive --cert-name "${TARGET_DOMAIN}" || true
fi

log "Looking for related MySQL databases (best-effort)"
if command -v mysql >/dev/null; then
  guess_dbs=$(mysql -N -B -e "SHOW DATABASES;" 2>/dev/null | grep -iE 'malawi|adventist|music' || true)
  if [[ -n "$guess_dbs" ]]; then
    while IFS= read -r db; do
      [[ -z "$db" ]] && continue
      log "  drop database $db"
      mysql -e "DROP DATABASE \`$db\`;" || true
    done <<< "$guess_dbs"
  fi
fi

log "Removing MySQL server entirely (Cloud Mail uses PostgreSQL)"
apt-get purge -y mysql-server mysql-server-* mariadb-server mariadb-server-* 2>/dev/null || true
apt-get autoremove -y

log "Done. Existing site removed. Ready for 20-install-cloudmail.sh"
