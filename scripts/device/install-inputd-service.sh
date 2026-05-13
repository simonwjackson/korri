#!/usr/bin/env bash
# Install/manage the Korri input daemon service on the Device.
#
# This script is intentionally conservative: it only persistently masks ROCKNIX
# input.service after korri-inputd has a persistent unit, starts successfully,
# and its WebSocket port accepts connections.

set -euo pipefail

PROJECT="${DEVICE_APP_ROOT:-/storage/.guest/korri/app}"
PORT="${KORRI_INPUT_BRIDGE_PORT:-${DEVICE_INPUT_BRIDGE_PORT:-3002}}"
LOG="${KORRI_INPUTD_LOG:-/storage/.guest/korri/logs/inputd.log}"
UNIT_NAME="korri-inputd.service"
UNIT_DIR="${KORRI_INPUTD_UNIT_DIR:-/storage/.config/systemd/system}"
UNIT_PATH="${KORRI_INPUTD_SERVICE_PATH:-$UNIT_DIR/$UNIT_NAME}"

log() { printf '\033[0;36m[inputd-service]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[0;33m[inputd-service]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[inputd-service]\033[0m %s\n' "$*" >&2; exit 1; }

write_unit() {
  mkdir -p "$(dirname "$UNIT_PATH")"
  cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Korri input daemon
After=inputplumber.service network-online.target
Wants=inputplumber.service

[Service]
Type=simple
Environment=DEVICE_APP_ROOT=$PROJECT
Environment=KORRI_INPUT_BRIDGE_PORT=$PORT
Environment=KORRI_INPUTD_LOG=$LOG
WorkingDirectory=$PROJECT
ExecStart=$PROJECT/scripts/device/run-inputd.sh
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
  [ -x "$PROJECT/scripts/device/run-inputd.sh" ] || fail "missing $PROJECT/scripts/device/run-inputd.sh"
  mkdir -p "$(dirname "$LOG")"

  log "Writing $UNIT_PATH"
  write_unit
  reload_units
  systemctl enable "$UNIT_NAME" >/dev/null 2>&1 || fail "could not enable $UNIT_NAME from $UNIT_PATH"
  log "Installed persistent $UNIT_NAME"
}

start_service() {
  mkdir -p "$(dirname "$LOG")"
  : > "$LOG"
  systemctl restart "$UNIT_NAME" >/dev/null 2>&1 || fail "could not restart $UNIT_NAME"
  wait_ready || {
    warn "korri-inputd did not become ready on port $PORT; last log lines:"
    tail -60 "$LOG" 2>/dev/null || true
    exit 1
  }
  log "korri-inputd ready on 127.0.0.1:$PORT"
}

mask_rocknix_input() {
  systemctl is-enabled "$UNIT_NAME" >/dev/null 2>&1 || fail "$UNIT_NAME is not enabled; refusing to persistently mask input.service"
  wait_ready || fail "korri-inputd is not ready; refusing to mask input.service"
  systemctl stop input.service >/dev/null 2>&1 || true
  systemctl mask input.service >/dev/null 2>&1 || fail "could not mask input.service"
  log "ROCKNIX input.service stopped/masked; korri-inputd owns input policy"
}

rollback() {
  systemctl unmask input.service >/dev/null 2>&1 || true
  systemctl start input.service >/dev/null 2>&1 || true
  systemctl stop "$UNIT_NAME" >/dev/null 2>&1 || true
  log "Rollback requested: input.service unmasked/started; korri-inputd stopped"
}

status() {
  echo "unit=$UNIT_PATH"
  systemctl --no-pager --full status "$UNIT_NAME" 2>/dev/null || true
  echo ""
  echo "input.service:"
  systemctl --no-pager --full is-enabled input.service 2>/dev/null || true
  systemctl --no-pager --full is-active input.service 2>/dev/null || true
  echo ""
  echo "log=$LOG"
  tail -20 "$LOG" 2>/dev/null || true
}

case "${1:-install-start-mask}" in
  install) install_service ;;
  start) start_service ;;
  mask-rocknix-input) mask_rocknix_input ;;
  install-start-mask)
    install_service
    start_service
    mask_rocknix_input
    ;;
  rollback) rollback ;;
  status) status ;;
  *) echo "usage: $0 {install|start|mask-rocknix-input|install-start-mask|rollback|status}" >&2; exit 64 ;;
esac
