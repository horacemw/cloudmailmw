#!/usr/bin/env bash
# ─── Cloud Mail — pull latest source, build, and reload services ────
# Idempotent. Deploys from a git tag or a tarball uploaded to /opt/cloudmail/incoming/*.tar.gz.

set -euo pipefail
IFS=$'\n\t'

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run as root"

RELEASE_DIR="/opt/cloudmail/releases/$(date -u +%Y%m%dT%H%M%SZ)"
CURRENT_LINK="/opt/cloudmail/current"
SOURCE_TARBALL="${1:-}"

install -d /opt/cloudmail/releases

if [[ -n "${SOURCE_TARBALL}" && -f "${SOURCE_TARBALL}" ]]; then
  log "Unpacking ${SOURCE_TARBALL}"
  install -d "${RELEASE_DIR}"
  tar -xzf "${SOURCE_TARBALL}" -C "${RELEASE_DIR}" --strip-components=1
else
  die "Usage: $0 <cloudmail-source.tar.gz>"
fi

log "Installing dependencies (web)"
# vite/tsc/plugins live in devDeps but are required to BUILD the static bundle.
# The runtime output is a static bundle served by nginx — no node deps at runtime.
( cd "${RELEASE_DIR}/apps/web" && npm ci && npm run build )

log "Installing dependencies (api)"
( cd "${RELEASE_DIR}/apps/api"
  npm ci
  npx prisma generate
  # No migration history; use db push for additive schema sync.
  set -a; source /etc/cloudmail/api.env; set +a
  npx prisma db push --skip-generate
  npm run build
)

chown -R cloudmail:cloudmail "${RELEASE_DIR}"

log "Atomically swapping the current symlink"
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}.new"
mv -T "${CURRENT_LINK}.new" "${CURRENT_LINK}"

log "Restarting services"
systemctl restart cloudmail-api cloudmail-worker
systemctl reload nginx

log "Health check"
sleep 2
curl -fsS https://localhost/v1/live -k || die "health check failed"

log "Deployed: ${RELEASE_DIR}"
