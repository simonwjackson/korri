#!/usr/bin/env bash
# Install/manage the Korri renderer session supervisor service on the Odin.

set -euo pipefail

PROJECT="${ODIN_PROJECT:-/storage/korri}"
PORT="${KORRI_SESSIOND_PORT:-3003}"
LOG="${KORRI_SESSIOND_LOG:-/storage/korri-sessiond.log}"
TOKEN_FILE="${KORRI_SESSIOND_TOKEN_FILE:-$PROJECT/sessiond.token}"
ELECTROBUN_APP="${KORRI_ELECTROBUN_APP:-/storage/.nix-profile/bin/korri-desktop-odin}"
ELECTROBUN_STATE_ROOT="${KORRI_ELECTROBUN_STATE_ROOT:-/storage/.local/share/nix-apps/korri-electrobun}"
ELECTROBUN_STATUS_FILE="${KORRI_ELECTROBUN_STATUS_FILE:-$ELECTROBUN_STATE_ROOT/status.json}"
UNIT_NAME="korri-sessiond.service"
UNIT_DIR="${KORRI_SESSIOND_UNIT_DIR:-/storage/.config/systemd/system}"
UNIT_PATH="${KORRI_SESSIOND_SERVICE_PATH:-$UNIT_DIR/$UNIT_NAME}"

log() { printf '\033[0;36m[sessiond-service]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[0;33m[sessiond-service]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[sessiond-service]\033[0m %s\n' "$*" >&2; exit 1; }

ensure_token() {
  if [ -f "$TOKEN_FILE" ]; then
    chmod 600 "$TOKEN_FILE" 2>/dev/null || true
    return
  fi
  umask 077
  mkdir -p "$(dirname "$TOKEN_FILE")"
  head -c 32 /dev/urandom | base64 > "$TOKEN_FILE"
}

write_unit() {
  mkdir -p "$(dirname "$UNIT_PATH")"
  cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Korri renderer session supervisor
After=network-online.target

[Service]
Type=simple
Environment=ODIN_PROJECT=$PROJECT
Environment=KORRI_SESSIOND_PORT=$PORT
Environment=KORRI_SESSIOND_LOG=$LOG
Environment=KORRI_SESSIOND_TOKEN_FILE=$TOKEN_FILE
Environment=KORRI_SESSIOND_URL=http://127.0.0.1:$PORT
Environment=KORRI_ELECTROBUN_APP=$ELECTROBUN_APP
Environment=KORRI_ELECTROBUN_STATE_ROOT=$ELECTROBUN_STATE_ROOT
Environment=KORRI_ELECTROBUN_STATUS_FILE=$ELECTROBUN_STATUS_FILE
WorkingDirectory=$PROJECT
ExecStart=$PROJECT/scripts/odin/run-sessiond.sh
Restart=always
RestartSec=1
StandardOutput=append:$LOG
StandardError=append:$LOG

[Install]
WantedBy=multi-user.target
EOF
}

reload_units() {
  systemctl daemon-reload >/dev/null 2>&1 || true
  if ! systemctl cat "$UNIT_NAME" >/dev/null 2>&1; then
    systemctl link "$UNIT_PATH" >/dev/null 2>&1 || true
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
}

wait_ready() {
  local ready=0
  for _ in $(seq 1 30); do
    if (echo > "/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.5
  done
  [ "$ready" = "1" ] || return 1
}

install_service() {
  [ -x /storage/bin/bun ] || fail "missing /storage/bin/bun"
  [ -x "$PROJECT/scripts/odin/run-sessiond.sh" ] || fail "missing $PROJECT/scripts/odin/run-sessiond.sh"
  if ! command -v "$ELECTROBUN_APP" >/dev/null 2>&1 && [ ! -x "$ELECTROBUN_APP" ]; then
    fail "missing Electrobun app: $ELECTROBUN_APP"
  fi
  ensure_token
  log "Writing $UNIT_PATH"
  write_unit
  reload_units
  systemctl enable "$UNIT_NAME" >/dev/null 2>&1 || fail "could not enable $UNIT_NAME from $UNIT_PATH"
  log "Installed persistent $UNIT_NAME"
}

start_service() {
  : > "$LOG"
  systemctl restart "$UNIT_NAME" >/dev/null 2>&1 || fail "could not restart $UNIT_NAME"
  wait_ready || {
    warn "korri-sessiond did not become ready on port $PORT; last log lines:"
    tail -60 "$LOG" 2>/dev/null || true
    exit 1
  }
  log "korri-sessiond ready on 127.0.0.1:$PORT"
}

rollback() {
  systemctl stop "$UNIT_NAME" >/dev/null 2>&1 || true
  systemctl disable "$UNIT_NAME" >/dev/null 2>&1 || true
  systemctl unmask --runtime essway.service >/dev/null 2>&1 || true
  systemctl start essway.service >/dev/null 2>&1 || true
  log "Rollback requested: sessiond stopped/disabled; essway restore requested"
}

status() {
  echo "unit=$UNIT_PATH"
  echo "renderer=electrobun"
  echo "electrobun_app=$ELECTROBUN_APP"
  systemctl --no-pager --full status "$UNIT_NAME" 2>/dev/null || true
  echo ""
  echo "sessiond:"
  curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null || true
  echo ""
  echo "log=$LOG"
  tail -20 "$LOG" 2>/dev/null || true
}

case "${1:-install-start}" in
  install) install_service ;;
  start) start_service ;;
  install-start)
    install_service
    start_service
    ;;
  rollback) rollback ;;
  status) status ;;
  *) echo "usage: $0 {install|start|install-start|rollback|status}" >&2; exit 64 ;;
esac
