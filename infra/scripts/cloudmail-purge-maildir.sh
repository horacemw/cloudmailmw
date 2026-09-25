#!/bin/bash
# Deletes a single mailbox's Maildir tree. Invoked by the API's purge worker
# via sudo -n (see /etc/sudoers.d/cloudmail-purge). Root privilege is
# required because /var/vmail/... is owned by vmail:vmail 0770.
#
# Strict input validation is enforced before any filesystem action.
# Target format: <domain>/<localpart> — same as the mailbox address split
# on '@'. Only the vmail address-safe character set is allowed.
#
# Two-layer safety:
#   1. Regex match on the argument before shell touches it.
#   2. readlink -f the final path and reject if it isn't inside /var/vmail
#      (defence-in-depth against symlink-based escapes).
#
# Exit codes:
#   0  purged successfully OR the Maildir did not exist (both are ok)
#   1  input rejected OR canonical path outside /var/vmail
#   2  unexpected rm failure

set -euo pipefail
IFS=$'\n\t'

TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "usage: $0 <domain>/<localpart>" >&2
  exit 1
fi

# RFC-permissive but paranoid: domain [a-z0-9][a-z0-9.-]{0,253} then /
# then localpart [a-z0-9][a-z0-9._-]{0,62}. No absolute paths, no `..`.
if ! [[ "$TARGET" =~ ^[a-z0-9][a-z0-9.-]{0,253}/[a-z0-9][a-z0-9._-]{0,62}$ ]]; then
  echo "invalid target: $TARGET" >&2
  exit 1
fi

FULL="/var/vmail/$TARGET"

if [ ! -e "$FULL" ]; then
  # Nothing to do — treat as success so the worker doesn't retry forever.
  echo "no such maildir: $FULL"
  exit 0
fi

# Defence in depth: resolve any symlinks and refuse anything not inside
# /var/vmail. Would catch a malicious symlink someone planted, though
# vmail:0770 makes that hard.
CANONICAL=$(readlink -f "$FULL")
case "$CANONICAL" in
  /var/vmail/*) : ;;
  *)
    echo "refusing to rm outside /var/vmail: $CANONICAL" >&2
    exit 1
    ;;
esac
if [ "$CANONICAL" = "/var/vmail" ] || [ "$CANONICAL" = "/var/vmail/" ]; then
  echo "refusing to rm /var/vmail itself" >&2
  exit 1
fi

if ! rm -rf -- "$CANONICAL"; then
  echo "rm failed: $CANONICAL" >&2
  exit 2
fi

echo "purged $CANONICAL"
exit 0
