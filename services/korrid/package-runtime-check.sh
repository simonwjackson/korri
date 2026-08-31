#!/usr/bin/env bash
set -Eeuo pipefail

binary="${1:?korrid binary is required}"
bash_bin="${2:?bash path is required}"
curl_bin="${3:?curl path is required}"
jq_bin="${4:?jq path is required}"
coreutils_bin="${5:?coreutils bin directory is required}"
export PATH="$coreutils_bin"

root="$(mktemp -d)"
pid=''
cleanup() {
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$root"
}
trap cleanup EXIT

mkdir -p "$root/home" "$root/private" "$root/storage" "$root/sunshine"
printf '%s\n' \
  'label = "package-check"' \
  '[[games]]' \
  'id = "inputd-gate"' \
  'title = "Input gate"' \
  "command = [\"$coreutils_bin/sleep\", \"1\"]" \
  >"$root/host.toml"
printf '#!%s\n%s\n' "$bash_bin" \
  'case " $* " in *" list-units "*) exit 0 ;; *" show "*) printf "not-found\\n"; exit 0 ;; *) exit 1 ;; esac' \
  >"$root/systemctl"
printf '#!%s\nexit 1\n' "$bash_bin" >"$root/systemd-run"
chmod 0700 "$root/systemctl" "$root/systemd-run"

HOME="$root/home" \
KORRID_MODE=host \
KORRID_ADDRESS=127.0.0.1:43999 \
KORRID_HOST_CONFIG="$root/host.toml" \
KORRID_STORAGE_ROOT="$root/storage" \
KORRID_PRIVATE_STATE_ROOT="$root/private" \
KORRID_SUNSHINE_PRIVATE_STATE_ROOT="$root/sunshine" \
KORRID_SYSTEMCTL="$root/systemctl" \
KORRID_SYSTEMD_RUN="$root/systemd-run" \
  "$binary" >"$root/stdout" 2>"$root/stderr" &
pid=$!

healthy=false
for _ in $(seq 1 100); do
  if "$curl_bin" --fail --silent --connect-timeout 1 --max-time 2 \
    http://127.0.0.1:43999/rpc \
    -H 'content-type: application/json' \
    -d '{"_tag":"app.catalog.snapshot","payload":{}}' >"$root/catalog.json"; then
    healthy=true
    break
  fi
  sleep 0.05
done
[[ "$healthy" == true ]] || { printf 'packaged korrid did not start\n' >&2; exit 1; }

"$curl_bin" --fail --silent --connect-timeout 1 --max-time 2 \
  http://127.0.0.1:43999/rpc \
  -H 'content-type: application/json' \
  -d '{"_tag":"app.session.prepare","payload":{"gameId":"inputd-gate"}}' \
  >"$root/prepare.json"
[[ "$("$jq_bin" -r '.outcome._tag' "$root/prepare.json")" == Err ]]
[[ "$("$jq_bin" -r '.outcome.payload.code' "$root/prepare.json")" == HostLaunchFailed ]]
[[ -d "$root/private/host-session" ]]
[[ "$(stat -c '%a' "$root/private/host-session")" == 700 ]]
[[ ! -e "$root/home/.local/state/korri/host-session" ]]

printf 'korrid package runtime check passed\n'
