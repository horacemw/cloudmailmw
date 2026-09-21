#!/usr/bin/env bash
# ─── Cloud Mail — server preflight audit ────────────────────────────
# Read-only. Prints a full inventory of the server before we change anything.
# Run: sudo bash 00-preflight.sh > /root/cloudmail-preflight-$(date +%F).txt

set -u
export LC_ALL=C

hr() { printf '\n──── %s ────────────────────────────────────────────────\n' "$1"; }
run() { printf '\n$ %s\n' "$*"; "$@" 2>&1 || true; }

hr "system"
run uname -a
run cat /etc/os-release
run uptime
run date --utc
run timedatectl status

hr "cpu / memory / disk"
run lscpu | head -20
run free -h
run df -hT --exclude-type=tmpfs --exclude-type=devtmpfs
run lsblk

hr "network"
run ip -brief address
run ip -brief link
run ip route
run cat /etc/hosts

hr "listening sockets"
run ss -tulnp
run ufw status verbose

hr "packages of interest"
for p in nginx apache2 caddy postfix dovecot rspamd clamav-daemon opendkim redis-server postgresql mysql-server mariadb-server nodejs php-fpm docker.io docker-ce; do
  printf '  %-24s -> ' "$p"
  dpkg-query -W -f='${Status} ${Version}\n' "$p" 2>/dev/null || echo "(not installed)"
done

hr "running services"
run systemctl list-units --type=service --state=running --no-legend

hr "web servers (nginx sites)"
run ls -la /etc/nginx/sites-enabled/ 2>/dev/null
run nginx -T 2>/dev/null | head -200

hr "docker (if present)"
if command -v docker >/dev/null; then
  run docker ps -a
  run docker images
  run docker volume ls
  run docker network ls
fi

hr "existing databases"
run systemctl status postgresql --no-pager
if command -v mysql >/dev/null; then run mysql --version; fi
run ls -la /var/lib/mysql 2>/dev/null
run ls -la /var/lib/postgresql 2>/dev/null

hr "existing app footprints"
run ls -la /var/www /opt /srv /home 2>/dev/null

hr "cron jobs"
run ls -la /etc/cron.* /var/spool/cron/crontabs 2>/dev/null
for u in $(cut -d: -f1 /etc/passwd); do
  c=$(crontab -u "$u" -l 2>/dev/null) && printf '\n[user %s]\n%s\n' "$u" "$c"
done

hr "system users"
run getent passwd | grep -E ':/(bin/bash|bin/sh|home/)' | head -20

hr "ssh config"
run sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|permitemptypasswords|pubkeyauthentication)' || true
run ls -la /root/.ssh 2>/dev/null

hr "existing TLS certificates"
run ls -la /etc/letsencrypt/live 2>/dev/null

hr "large files (> 100 MB) in likely places"
run find /var /opt /srv /home -xdev -type f -size +100M 2>/dev/null | head -50

hr "done"
echo "Preflight complete. Review before proceeding with 10-wipe-existing.sh."
