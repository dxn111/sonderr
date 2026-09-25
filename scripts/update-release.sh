#!/bin/sh
set -eu
umask 077

REPOSITORY="https://github.com/dxn111/sonderr.git"
TAG="${1:-}"
PORT="${2:-}"
OLD_PID="${3:-}"
WORKSPACE="${4:-$HOME}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
EXPECTED_INSTALL="${SONDERR_INSTALL_DIR:-$DATA_HOME/sonderr-v1.5}"
INSTALL_DIR="${SONDERR_UPDATE_INSTALL_DIR:-$EXPECTED_INSTALL}"
LOG_DIR="$HOME/.sonderr"
LOG_FILE="$LOG_DIR/update.log"
TEMP_DIR=""
BACKUP_DIR=""
NEW_PID=""
SWAPPED=0

fail() {
  printf 'Update failed: %s\n' "$*" >&2
  if [ -d "$LOG_DIR" ]; then printf 'Update failed: %s\n' "$*" >>"$LOG_FILE"; fi
  exit 1
}

if [ "$INSTALL_DIR" != "$EXPECTED_INSTALL" ]; then fail "target install path does not match the official install location"; fi
case "$TAG" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) fail "invalid release tag" ;;
esac
case "$PORT" in
  ''|*[!0-9]*) fail "invalid local port" ;;
esac
case "$OLD_PID" in
  ''|*[!0-9]*) fail "invalid running process id" ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then fail "invalid local port"; fi
if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ] || [ ! -f "$INSTALL_DIR/bin/sonderr-1.5.js" ]; then
  fail "managed Sonderr install was not found"
fi
if [ "$(node -p 'require(process.argv[1]).name' "$INSTALL_DIR/package.json")" != "sonderr-v1.5" ]; then
  fail "install target is not Sonderr"
fi
if [ ! -d "$WORKSPACE" ]; then WORKSPACE="$HOME"; fi
cd "$WORKSPACE"

mkdir -p "$LOG_DIR" "$DATA_HOME"
chmod 700 "$LOG_DIR"
: >"$LOG_FILE"
chmod 600 "$LOG_FILE"
TEMP_DIR="$(mktemp -d "$DATA_HOME/.sonderr-update.XXXXXX")"

restart_app() {
  if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/bin/sonderr-1.5.js" ]; then
    nohup node "$INSTALL_DIR/bin/sonderr-1.5.js" --no-open --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
  fi
}

restore_and_restart() {
  if [ -n "$NEW_PID" ] && kill -0 "$NEW_PID" 2>/dev/null; then kill "$NEW_PID" 2>/dev/null || true; fi
  if [ "$SWAPPED" -eq 1 ] && [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    mv "$INSTALL_DIR" "$TEMP_DIR/failed-install" 2>>"$LOG_FILE" || true
    mv "$BACKUP_DIR" "$INSTALL_DIR" 2>>"$LOG_FILE" || true
    SWAPPED=0
  fi
  restart_app
}

finish() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ]; then restore_and_restart; fi
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then rm -rf -- "$TEMP_DIR"; fi
  exit "$code"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

printf 'Waiting for the old Sonderr process to stop…\n' >>"$LOG_FILE"
waited=0
while kill -0 "$OLD_PID" 2>/dev/null; do
  if [ "$waited" -ge 120 ]; then fail "old Sonderr process did not stop"; fi
  sleep 0.25
  waited=$((waited + 1))
done

printf 'Downloading verified release tag %s…\n' "$TAG" >>"$LOG_FILE"
git clone --depth 1 --branch "$TAG" --single-branch "$REPOSITORY" "$TEMP_DIR/source" >>"$LOG_FILE" 2>&1 || fail "could not download the official release"
PACKAGE_NAME="$(node -p 'require(process.argv[1]).name' "$TEMP_DIR/source/package.json")"
PACKAGE_VERSION="$(node -p 'require(process.argv[1]).version' "$TEMP_DIR/source/package.json")"
if [ "$PACKAGE_NAME" != "sonderr-v1.5" ] || "${TAG#v}" != "$PACKAGE_VERSION"; then fail "downloaded release version did not match the verified tag"; fi
npm --prefix "$TEMP_DIR/source" ci --omit=dev >>"$LOG_FILE" 2>&1 || fail "dependency installation failed"

BACKUP_DIR="$INSTALL_DIR.backup.$(date +%Y%m%d%H%M%S)"
if [ -e "$BACKUP_DIR" ] || [ -L "$BACKUP_DIR" ]; then fail "backup path already exists"; fi
mv "$INSTALL_DIR" "$BACKUP_DIR" || fail "could not preserve the current install"
SWAPPED=1
if ! mv "$TEMP_DIR/source" "$INSTALL_DIR"; then
  mv "$BACKUP_DIR" "$INSTALL_DIR" || fail "could not restore the previous install"
  SWAPPED=0
  fail "could not activate the downloaded release"
fi
chmod +x "$INSTALL_DIR/bin/sonderr-1.5.js"

printf 'Starting Sonderr v%s on localhost…\n' "$PACKAGE_VERSION" >>"$LOG_FILE"
nohup node "$INSTALL_DIR/bin/sonderr-1.5.js" --no-open --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
NEW_PID=$!
started=0
attempt=0
while [ "$attempt" -lt 60 ]; do
  if node -e 'fetch(process.argv[1]).then(async r=>{const d=await r.json();process.exit(r.ok&&d.version===process.argv[2]?0:1)}).catch(()=>process.exit(1))' "http://127.0.0.1:$PORT/api/health" "$PACKAGE_VERSION" >>"$LOG_FILE" 2>&1; then
    started=1
    break
  fi
  if ! kill -0 "$NEW_PID" 2>/dev/null; then break; fi
  attempt=$((attempt + 1))
  sleep 0.5
done
if [ "$started" -ne 1 ]; then fail "updated app did not pass its localhost health check"; fi

SWAPPED=0
NEW_PID=""
printf 'Update to Sonderr v%s completed. Previous install preserved at %s\n' "$PACKAGE_VERSION" "$BACKUP_DIR" >>"$LOG_FILE"
exit 0
