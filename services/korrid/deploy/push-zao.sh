#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
started="$(date +%s)"
package_paths=(flake.nix flake.lock services/korrid)
untracked_package="$(git -C "$root" ls-files --others --exclude-standard -- "${package_paths[@]}")"
revision="$(git -C "$root" describe --always --dirty)"
flake_ref="path:$root"
if git -C "$root" diff --quiet -- "${package_paths[@]}" && \
  git -C "$root" diff --cached --quiet -- "${package_paths[@]}" && \
  [[ -z "$untracked_package" ]]; then
  revision="$(git -C "$root" rev-parse HEAD)"
  flake_ref="git+file://$root?rev=$revision"
elif [[ -n "$untracked_package" && "$revision" != *-dirty ]]; then
  revision="$revision-dirty"
fi
package="$(nix build "$flake_ref#korrid" --no-link --print-out-paths)"
ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=5
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)
revision_file="$(mktemp)"
remote_tmp=""
cleanup() {
  rm -f "$revision_file"
  if [[ -n "$remote_tmp" ]]; then
    ssh "${ssh_options[@]}" zao rm -rf -- "$remote_tmp" || true
  fi
}
trap cleanup EXIT
printf '%s\n' "$revision" > "$revision_file"

NIX_SSHOPTS="${ssh_options[*]}" nix copy --to ssh://zao "$package"
remote_tmp="$(ssh "${ssh_options[@]}" zao mktemp -d /tmp/korrid-deploy.XXXXXX)"
scp "${ssh_options[@]}" \
  "$root/services/korrid/deploy/korrid.service" \
  "zao:$remote_tmp/korrid.service"
scp "${ssh_options[@]}" \
  "$root/services/korrid/deploy/host.zao.toml" \
  "zao:$remote_tmp/host.toml"
scp "${ssh_options[@]}" \
  "$root/services/korrid/deploy/zao-remote.sh" \
  "zao:$remote_tmp/zao-remote.sh"
scp "${ssh_options[@]}" "$revision_file" "zao:$remote_tmp/revision"
ssh "${ssh_options[@]}" zao "$remote_tmp/zao-remote.sh" install "$package" "$remote_tmp"

zao_url="${ZAO_KORRID_URL:-http://100.114.19.92:43117}"
for _ in $(seq 1 40); do
  if response="$(curl --fail --silent --connect-timeout 1 --max-time 2 \
    "$zao_url/rpc" \
    -H 'content-type: application/json' \
    -d '{"_tag":"app.catalog.snapshot","payload":{}}')" && \
    jq -e '._tag == "app.catalog.snapshot"
      and .outcome._tag == "Ok"
      and any(.outcome.payload.games[]; .id == "neverball" and .host == "zao")' \
      <<<"$response" >/dev/null; then
    elapsed="$(( $(date +%s) - started ))"
    echo "zao korrid deployed with Neverball in ${elapsed}s ($revision)"
    exit 0
  fi
  sleep 0.25
done

echo "zao korrid did not serve the expected Neverball catalog" >&2
exit 1
