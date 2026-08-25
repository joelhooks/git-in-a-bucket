#!/bin/sh
# One-time root step on the NAS: install a DSM boot hook that starts MinIO
# at boot by running the start script the alchemy deploy already installed.
#
#   sudo sh install-boot-hook.sh /path/to/walgit-demo <run-as-user>
#
# Synology preserves /usr/local/etc/rc.d across DSM updates. This is the one
# step the NasMinio provider refuses to do itself: it never runs as root,
# the same stance it takes on credentials.
set -eu

BASE_DIR=${1:?usage: install-boot-hook.sh BASE_DIR RUN_AS}
RUN_AS=${2:?usage: install-boot-hook.sh BASE_DIR RUN_AS}
HOOK=/usr/local/etc/rc.d/S99walgit-demo.sh

test "$(id -u)" -eq 0 || { echo 'run as root (sudo)' >&2; exit 1; }
id "$RUN_AS" >/dev/null
test -x "$BASE_DIR/bin/start-minio.sh" || {
  echo "missing $BASE_DIR/bin/start-minio.sh — run the alchemy deploy first" >&2
  exit 1
}

TMP=$(mktemp)
cat > "$TMP" <<'HOOK_EOF'
#!/bin/sh
# walgit-demo boot hook. Installed by install-boot-hook.sh from
# github.com/joelhooks/git-in-a-bucket — starts MinIO as __RUN_AS__ once
# __BASE_DIR__ is available. Idempotent; safe to run repeatedly.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
LOG=/var/log/walgit-demo-boot.log

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"
}

case "${1:-start}" in
  start)
    log 'waiting for start script'
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
      [ -x __BASE_DIR__/bin/start-minio.sh ] && break
      sleep 2
    done
    if [ ! -x __BASE_DIR__/bin/start-minio.sh ]; then
      log 'FAILED: start script never appeared (volume not mounted?)'
      exit 1
    fi
    code=$(su __RUN_AS__ -s /bin/sh -c 'sh __BASE_DIR__/bin/start-minio.sh' 2>> "$LOG" || true)
    log "start-minio probe: ${code:-none}"
    ;;
  stop)
    log 'stop: killing recorded pid'
    su __RUN_AS__ -s /bin/sh -c '[ -f __BASE_DIR__/minio.pid ] && kill "$(cat __BASE_DIR__/minio.pid)" 2>/dev/null; rm -f __BASE_DIR__/minio.pid' || true
    ;;
esac
exit 0
HOOK_EOF

mkdir -p /usr/local/etc/rc.d
sed -e "s|__BASE_DIR__|$BASE_DIR|g" -e "s|__RUN_AS__|$RUN_AS|g" "$TMP" > "$HOOK"
rm -f "$TMP"
chmod 755 "$HOOK"
chown root:root "$HOOK"

echo "installed $HOOK (starts MinIO as $RUN_AS at boot; log: /var/log/walgit-demo-boot.log)"
