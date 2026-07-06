#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/scripts/live-runtime-resolution-gate.sh [options]

Runs the autonomous live runtime-resolution validation loop against the lab.
It starts Moonlight/gamescope on the client, optionally schedules an env-driven
runtime resolution change, sends input through the client, captures both client
and host views, pulls artifacts locally, and writes a small summary.

Options:
  --label LABEL              Artifact/run label (default: timestamped)
  --client HOST              SSH host alias for client device (default: bandai)
  --host HOST                SSH host alias for source machine (default: aka)
  --probe-dir PATH           Client probe directory (default: /storage/probe-a-resolution)
  --local-artifacts PATH     Local output dir (default: /tmp/live-runtime-resolution-gate)
  --resolution WxH           Schedule env-driven runtime resolution request
  --delay seconds            Delay before env-driven request (default: 6)
  --repeat-resolution-after seconds
                             After initial post-switch input, send the same resolution
                             request again after this delay, then replay input (recovery kick)
  --repeat-resolution-count count
                             Number of repeated same-resolution requests (default: 1 when
                             --repeat-resolution-after is set)
  --keys LIST                Comma-separated keys to send after switch/start
                             Known names: esc,enter,space,w,a,s,d,up,down,left,right
                             Default: esc,w
  --post-wait seconds        Seconds to wait after inputs before final capture (default: 2)
  --no-clean-start           Do not kill moonlight/gamescope before start
  --no-visual-compare        Skip ImageMagick RMSE comparison
  --host-window-id ID        Host X11 window id (default: 0x4a00001)
  --sunshine-bin PATH        Temporarily run this Sunshine binary on host
  --sunshine-conf PATH       Sunshine config path for override
                             (default: /nix/store/qjjj3jpvf8rjc8hdd2qrjszhbyllx4gf-sunshine.conf)
  --sunshine-libva PATH      Optional libva store path to prepend to LD_LIBRARY_PATH
  --no-restore-sunshine      Leave --sunshine-bin override running after the gate

Environment overrides:
  CLIENT_SSH_OPTS            Extra ssh options for client
  HOST_SSH_OPTS              Extra ssh options for host
  HOST_DISPLAY               Host DISPLAY (default: :0)
  HOST_XAUTHORITY            Host XAUTHORITY (default: /run/pressure-vessel/Xauthority)
  XWD_BIN                    Host xwd path
  XWDTOPNM_BIN               Host xwdtopnm path
  PNMTOPNG_BIN               Host pnmtopng path
  YDOTOOL_BIN                Client ydotool path
  YDOTOOL_SOCKET             Client ydotool socket (default: /run/user/0/.ydotool_socket)
EOF
}

label="gate-$(date +%Y%m%d-%H%M%S)"
client="bandai"
host="aka"
probe_dir="/storage/probe-a-resolution"
local_artifacts="/tmp/live-runtime-resolution-gate"
resolution=""
delay_s="6"
repeat_resolution_after_s=""
repeat_resolution_count=""
keys="esc,w"
post_wait_s="2"
clean_start=1
visual_compare=1
host_window_id="0x4a00001"
sunshine_bin=""
sunshine_conf="/nix/store/qjjj3jpvf8rjc8hdd2qrjszhbyllx4gf-sunshine.conf"
sunshine_libva=""
restore_sunshine=1
known_good_sunshine_bin="/nix/store/jmhkdca5sfyjfmgnwip30y4rpq3m9hx4-sunshine-korri-2025.924.154138-korri/bin/sunshine"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) label="$2"; shift 2 ;;
    --client) client="$2"; shift 2 ;;
    --host) host="$2"; shift 2 ;;
    --probe-dir) probe_dir="$2"; shift 2 ;;
    --local-artifacts) local_artifacts="$2"; shift 2 ;;
    --resolution) resolution="$2"; shift 2 ;;
    --delay) delay_s="$2"; shift 2 ;;
    --repeat-resolution-after) repeat_resolution_after_s="$2"; shift 2 ;;
    --repeat-resolution-count) repeat_resolution_count="$2"; shift 2 ;;
    --keys) keys="$2"; shift 2 ;;
    --post-wait) post_wait_s="$2"; shift 2 ;;
    --no-clean-start) clean_start=0; shift ;;
    --no-visual-compare) visual_compare=0; shift ;;
    --host-window-id) host_window_id="$2"; shift 2 ;;
    --sunshine-bin) sunshine_bin="$2"; shift 2 ;;
    --sunshine-conf) sunshine_conf="$2"; shift 2 ;;
    --sunshine-libva) sunshine_libva="$2"; shift 2 ;;
    --no-restore-sunshine) restore_sunshine=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

client_ssh_opts=${CLIENT_SSH_OPTS:-}
host_ssh_opts=${HOST_SSH_OPTS:-}
host_display=${HOST_DISPLAY:-:0}
host_xauthority=${HOST_XAUTHORITY:-/run/pressure-vessel/Xauthority}
remote_timeout_bin=${REMOTE_TIMEOUT_BIN:-timeout}
xwd_bin=${XWD_BIN:-/nix/store/66y6yh3pq6jiqaaxyap62lj8ahl7bgsz-xwd-1.0.9/bin/xwd}
xwdtopnm_bin=${XWDTOPNM_BIN:-/nix/store/91sd1hi8z4rjy2ql5svbwmpb65xwim00-netpbm-11.13.1-bin/bin/xwdtopnm}
pnmtopng_bin=${PNMTOPNG_BIN:-/nix/store/91sd1hi8z4rjy2ql5svbwmpb65xwim00-netpbm-11.13.1-bin/bin/pnmtopng}
ydotool_bin=${YDOTOOL_BIN:-/nix/store/7dmpnkxnagd290qpgslkxahkvw57a6wm-ydotool-1.0.4/bin/ydotool}
ydotoold_bin=${YDOTOOLD_BIN:-/nix/store/7dmpnkxnagd290qpgslkxahkvw57a6wm-ydotool-1.0.4/bin/ydotoold}
ydotool_socket=${YDOTOOL_SOCKET:-/run/user/0/.ydotool_socket}

run_dir="$local_artifacts/$label"
mkdir -p "$run_dir"
summary="$run_dir/summary.md"

ssh_client() {
  # shellcheck disable=SC2086
  ssh $client_ssh_opts "$client" "$@"
}

ssh_host() {
  # shellcheck disable=SC2086
  ssh $host_ssh_opts "$host" "$@"
}

scp_from_client() {
  # shellcheck disable=SC2086
  scp -r $client_ssh_opts "$client:$1" "$2"
}

scp_from_host() {
  # shellcheck disable=SC2086
  scp -r $host_ssh_opts "$host:$1" "$2"
}

scp_to_client() {
  # shellcheck disable=SC2086
  scp $client_ssh_opts "$1" "$client:$2"
}

key_code() {
  case "$1" in
    esc) echo 1 ;;
    enter) echo 28 ;;
    space) echo 57 ;;
    w) echo 17 ;;
    a) echo 30 ;;
    s) echo 31 ;;
    d) echo 32 ;;
    up) echo 103 ;;
    down) echo 108 ;;
    left) echo 105 ;;
    right) echo 106 ;;
    *) echo "unknown key '$1'" >&2; return 1 ;;
  esac
}

remote_quote() {
  printf '%q' "$1"
}

client_shots="$probe_dir/shots/$label"
client_artifacts="$probe_dir/artifacts/$label"
host_tmp="/tmp/$label"

{
  echo "# Live runtime resolution gate: $label"
  echo
  echo "- client: \`$client\`"
  echo "- host: \`$host\`"
  echo "- resolution request: \`${resolution:-none}\`"
  echo "- keys: \`$keys\`"
  echo "- started_at: \`$(date -Is)\`"
  if [[ -n "$sunshine_bin" ]]; then
    echo "- sunshine_override: \`$sunshine_bin\`"
    echo "- sunshine_libva: \`${sunshine_libva:-none}\`"
  fi
} > "$summary"

restore_sunshine_service() {
  if [[ -n "$sunshine_bin" && "$restore_sunshine" -eq 1 ]]; then
    echo "[gate] restoring known-good Sunshine"
    ssh_host "printf '[Service]\\nExecStart=\\nExecStart=%s %s\\n' $(remote_quote "$known_good_sunshine_bin") $(remote_quote "$sunshine_conf") | sudo tee /run/systemd/system/korri-sunshine.service.d/runtime-resolution-test.conf >/dev/null; sudo systemctl daemon-reload; sudo systemctl restart korri-sunshine.service >/dev/null"
  fi
}

trap restore_sunshine_service EXIT

if [[ -n "$sunshine_bin" ]]; then
  echo "[gate] applying temporary Sunshine override: $sunshine_bin"
  if [[ -n "$sunshine_libva" ]]; then
    ssh_host "printf '[Service]\\nEnvironment=LD_LIBRARY_PATH=%s/lib\\nExecStart=\\nExecStart=%s %s\\n' $(remote_quote "$sunshine_libva") $(remote_quote "$sunshine_bin") $(remote_quote "$sunshine_conf") | sudo tee /run/systemd/system/korri-sunshine.service.d/runtime-resolution-test.conf >/dev/null; sudo systemctl daemon-reload; sudo systemctl restart korri-sunshine.service >/dev/null"
  else
    ssh_host "printf '[Service]\\nExecStart=\\nExecStart=%s %s\\n' $(remote_quote "$sunshine_bin") $(remote_quote "$sunshine_conf") | sudo tee /run/systemd/system/korri-sunshine.service.d/runtime-resolution-test.conf >/dev/null; sudo systemctl daemon-reload; sudo systemctl restart korri-sunshine.service >/dev/null"
  fi
  sleep 2
fi

if [[ "$clean_start" -eq 1 ]]; then
  echo "[gate] cleaning client moonlight/gamescope"
  ssh_client "pkill -x moonlight || true; sleep 1; pkill -x gamescope || true; rm -f $(remote_quote "$probe_dir/run/control.sock")"
fi

if [[ -n "$resolution" ]]; then
  echo "[gate] creating env-driven launcher for $resolution after ${delay_s}s"
  launcher_local="$run_dir/live-resolution-gate-start.sh"
  cat > "$launcher_local" <<'REMOTE_EOF'
#!/usr/bin/env bash
set -euo pipefail
source __PROBE_DIR__/env.sh
LABEL=__LABEL__
export CANDIDATE_LOGS="$LOGS/$LABEL"
mkdir -p "$RUN" "$CANDIDATE_LOGS" "$SHOTS" "$ART"
echo "$CANDIDATE_LOGS" > "$RUN/current-log-dir"
rm -f "$MOONLIGHT_LOCAL_CONTROL_SOCKET"
export SWAYSOCK=$(ls /run/user/0/sway-ipc.*.sock 2>/dev/null | head -1)
GAMESCOPE=/nix/store/vcv3dq9n6x2wn2jm8x11c96jmymwcmgk-gamescope-3.16.23/bin/gamescope
MAPPING=$(dirname "$(dirname "$MOON")")/share/moonlight/korri-inputplumber-gamecontrollerdb.txt
if [ ! -f "$MAPPING" ]; then
  MAPPING=$(dirname "$(dirname "$MOON")")/share/moonlight/gamecontrollerdb.txt
fi
nohup setsid env \
  MOONLIGHT_LOCAL_CONTROL_AUTHORITY="$MOONLIGHT_LOCAL_CONTROL_AUTHORITY" \
  MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR="$MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR" \
  MOONLIGHT_LOCAL_CONTROL_SESSION_ID="$MOONLIGHT_LOCAL_CONTROL_SESSION_ID" \
  MOONLIGHT_LOCAL_CONTROL_SOCKET="$MOONLIGHT_LOCAL_CONTROL_SOCKET" \
  WAYLAND_DISPLAY="$WAYLAND_DISPLAY" \
  XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
  MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED=1 \
  MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION=__RESOLUTION__ \
  MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S=__DELAY__ \
  MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_REPEAT_AFTER_S=__REPEAT_AFTER__ \
  MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_REPEAT_COUNT=__REPEAT_COUNT__ \
  "$GAMESCOPE" -f -b -W 1920 -H 1080 -- \
  "$MOON" stream -platform v4l2m2m -mapping "$MAPPING" -width 1920 -height 1080 -fps 60 -bitrate 12000 -codec h264 -app Desktop aka \
  >"$CANDIDATE_LOGS/moonlight.log" 2>&1 &
echo $! > "$RUN/moonlight.pid"
echo "$LABEL"
REMOTE_EOF
  sed -i "s#__PROBE_DIR__#${probe_dir}#g; s#__LABEL__#${label}#g; s#__RESOLUTION__#${resolution}#g; s#__DELAY__#${delay_s}#g; s#__REPEAT_AFTER__#${repeat_resolution_after_s}#g; s#__REPEAT_COUNT__#${repeat_resolution_count}#g" "$launcher_local"
  start_cmd="$probe_dir/run/live-resolution-gate-start.sh"
  scp_to_client "$launcher_local" "$start_cmd" >/dev/null
  ssh_client "chmod +x $(remote_quote "$start_cmd")"
else
  start_cmd="$probe_dir/start-candidate.sh"
fi

echo "[gate] starting client stream"
ssh_client "$(remote_quote "$start_cmd")"

echo "[gate] waiting for streaming lifecycle"
ssh_client "source $(remote_quote "$probe_dir/env.sh"); ART=$(remote_quote "$client_artifacts") \$BUN $(remote_quote "$probe_dir/probe.ts") wait-streaming 40000"

sleep 3

echo "[gate] capturing baseline client+host"
ssh_client "mkdir -p $(remote_quote "$client_shots"); XDG_RUNTIME_DIR=/run/user/0 WAYLAND_DISPLAY=wayland-1 $(remote_quote "$remote_timeout_bin") 10 grim $(remote_quote "$client_shots/01-client-before-input.png")"
ssh_host "mkdir -p $(remote_quote "$host_tmp"); DISPLAY=$(remote_quote "$host_display") XAUTHORITY=$(remote_quote "$host_xauthority") $(remote_quote "$remote_timeout_bin") 10 $(remote_quote "$xwd_bin") -id $(remote_quote "$host_window_id") -silent | $(remote_quote "$xwdtopnm_bin") | $(remote_quote "$pnmtopng_bin") > $(remote_quote "$host_tmp/01-host-before-input.png")"

if [[ -n "$resolution" ]]; then
  echo "[gate] waiting for scheduled resolution request"
  sleep $((delay_s + 5))
  ssh_client "XDG_RUNTIME_DIR=/run/user/0 WAYLAND_DISPLAY=wayland-1 $(remote_quote "$remote_timeout_bin") 10 grim $(remote_quote "$client_shots/02-client-after-resolution.png") || true"
  ssh_host "DISPLAY=$(remote_quote "$host_display") XAUTHORITY=$(remote_quote "$host_xauthority") $(remote_quote "$remote_timeout_bin") 10 $(remote_quote "$xwd_bin") -id $(remote_quote "$host_window_id") -silent | $(remote_quote "$xwdtopnm_bin") | $(remote_quote "$pnmtopng_bin") > $(remote_quote "$host_tmp/02-host-after-resolution.png")"
fi

echo "[gate] ensuring ydotoold is available"
ssh_client "mkdir -p /run/user/0; if [ ! -S $(remote_quote "$ydotool_socket") ]; then nohup $(remote_quote "$ydotoold_bin") -p $(remote_quote "$ydotool_socket") -P 0600 >/storage/probe-a-resolution/run/ydotoold.log 2>&1 & sleep 1; fi; test -S $(remote_quote "$ydotool_socket")"

echo "[gate] sending client-originated input: $keys"
IFS=',' read -r -a key_names <<< "$keys"
for key_name in "${key_names[@]}"; do
  code=$(key_code "$key_name")
  ssh_client "YDOTOOL_SOCKET=$(remote_quote "$ydotool_socket") $(remote_quote "$ydotool_bin") key ${code}:1 ${code}:0 || true"
  sleep 1
done

if [[ -n "$repeat_resolution_after_s" && -n "$resolution" ]]; then
  echo "[gate] sending repeated same-resolution recovery request after initial input and ${repeat_resolution_after_s}s"
  sleep "$repeat_resolution_after_s"
  repeat_width="${resolution%x*}"
  repeat_height="${resolution#*x}"
  repeat_count_value="${repeat_resolution_count:-1}"
  for ((repeat_i = 0; repeat_i < repeat_count_value; repeat_i++)); do
    ssh_client "source $(remote_quote "$probe_dir/env.sh"); ART=$(remote_quote "$client_artifacts") \$BUN $(remote_quote "$probe_dir/probe.ts") send-resolution $(remote_quote "$repeat_width") $(remote_quote "$repeat_height")"
    sleep 2
  done
  echo "[gate] replaying client-originated input after recovery kick: $keys"
  for key_name in "${key_names[@]}"; do
    code=$(key_code "$key_name")
    ssh_client "YDOTOOL_SOCKET=$(remote_quote "$ydotool_socket") $(remote_quote "$ydotool_bin") key ${code}:1 ${code}:0 || true"
    sleep 1
  done
fi

sleep "$post_wait_s"

echo "[gate] capturing post-input client+host"
ssh_client "XDG_RUNTIME_DIR=/run/user/0 WAYLAND_DISPLAY=wayland-1 $(remote_quote "$remote_timeout_bin") 10 grim $(remote_quote "$client_shots/03-client-after-input.png") || true; source $(remote_quote "$probe_dir/env.sh"); ART=$(remote_quote "$client_artifacts") \$BUN $(remote_quote "$probe_dir/probe.ts") snapshot $(remote_quote "$label-after-input") || true; LOGDIR=\$(cat $(remote_quote "$probe_dir/run/current-log-dir")); cp \"\$LOGDIR/moonlight.log\" $(remote_quote "$client_shots/moonlight.log") || true"
ssh_host "DISPLAY=$(remote_quote "$host_display") XAUTHORITY=$(remote_quote "$host_xauthority") $(remote_quote "$remote_timeout_bin") 10 $(remote_quote "$xwd_bin") -id $(remote_quote "$host_window_id") -silent | $(remote_quote "$xwdtopnm_bin") | $(remote_quote "$pnmtopng_bin") > $(remote_quote "$host_tmp/03-host-after-input.png"); journalctl -u korri-sunshine.service --since '10 minutes ago' --no-pager > $(remote_quote "$host_tmp/sunshine-journal.log")"

echo "[gate] pulling artifacts to $run_dir"
scp_from_client "$client_shots/." "$run_dir/" >/dev/null
scp_from_host "$host_tmp/." "$run_dir/" >/dev/null

if [[ "$visual_compare" -eq 1 ]]; then
  echo "[gate] running visual RMSE comparison on the client top 1920x1080 viewport"
  compare_output_file="$run_dir/visual-compare.txt"
  cropped_client="$run_dir/03-client-after-input.top-1920x1080.png"
  if command -v magick >/dev/null 2>&1 && command -v compare >/dev/null 2>&1; then
    magick "$run_dir/03-client-after-input.png" -crop 1920x1080+0+0 "$cropped_client"
    compare -metric RMSE "$cropped_client" "$run_dir/03-host-after-input.png" null: >"$compare_output_file" 2>&1 || true
  else
    nix shell nixpkgs#imagemagick -c bash -lc '
      set -euo pipefail
      magick "$1" -crop 1920x1080+0+0 "$3"
      compare -metric RMSE "$3" "$2" null:
    ' bash "$run_dir/03-client-after-input.png" "$run_dir/03-host-after-input.png" "$cropped_client" >"$compare_output_file" 2>&1 || true
  fi
  echo "- visual_compare_crop: \`top 1920x1080 of client vs host\`" >> "$summary"
  echo "- visual_compare_rmse: \`$(tr '\n' ' ' < "$compare_output_file" | sed 's/[[:space:]]\+/ /g')\`" >> "$summary"
fi

{
  echo "- completed_at: \`$(date -Is)\`"
  echo "- client_after_input: \`$run_dir/03-client-after-input.png\`"
  echo "- host_after_input: \`$run_dir/03-host-after-input.png\`"
  echo "- moonlight_log: \`$run_dir/moonlight.log\`"
  echo "- sunshine_journal: \`$run_dir/sunshine-journal.log\`"
  echo
  echo "## Operator verdict"
  echo
  echo "- [ ] PASS: client and host show the same live post-input game state."
  echo "- [ ] FAIL: client is stale/divergent from host."
  echo "- [ ] INCONCLUSIVE: captures or setup failed."
} >> "$summary"

echo "[gate] complete: $run_dir"
cat "$summary"
