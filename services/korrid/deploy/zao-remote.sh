#!/run/current-system/sw/bin/bash
set -euo pipefail

action="${1:-}"
case "$action" in
  install)
    package="${2:?package store path required}"
    handoff="${3:?private handoff directory required}"
    revision="$(< "$handoff/revision")"
    if [[ ! -x "$HOME/.nix-profile/bin/neverball" ]]; then
      echo "Neverball is not provisioned; run the provision-game action first" >&2
      exit 1
    fi
    mkdir -p \
      "$HOME/.config/korrid" \
      "$HOME/.config/systemd/user" \
      "$HOME/.local/libexec" \
      "$HOME/.local/state/korrid/profiles"
    profile="$HOME/.local/state/korrid/profiles/$(basename "$package")"
    if [[ ! -e "$profile" ]]; then
      nix profile install --profile "$profile" "$package"
    fi

    previous_current=""
    if [[ -L "$HOME/.local/state/korrid/current" ]]; then
      previous_current="$(readlink "$HOME/.local/state/korrid/current")"
    fi
    previous_config="$handoff/host.toml.previous"
    had_previous_config=false
    if [[ -f "$HOME/.config/korrid/host.toml" ]]; then
      cp "$HOME/.config/korrid/host.toml" "$previous_config"
      had_previous_config=true
    fi
    previous_unit="$handoff/korrid.service.previous"
    had_previous_unit=false
    if [[ -f "$HOME/.config/systemd/user/korrid.service" ]]; then
      cp "$HOME/.config/systemd/user/korrid.service" "$previous_unit"
      had_previous_unit=true
    fi
    rollback_install() {
      trap - ERR
      if [[ -n "$previous_current" ]]; then
        ln -sfn "$previous_current" "$HOME/.local/state/korrid/current.next"
        mv -Tf \
          "$HOME/.local/state/korrid/current.next" \
          "$HOME/.local/state/korrid/current"
      else
        rm -f "$HOME/.local/state/korrid/current"
      fi
      if [[ "$had_previous_config" == true ]]; then
        install -m 0644 "$previous_config" "$HOME/.config/korrid/host.toml"
      else
        rm -f "$HOME/.config/korrid/host.toml"
      fi
      if [[ "$had_previous_unit" == true ]]; then
        install -m 0644 "$previous_unit" "$HOME/.config/systemd/user/korrid.service"
      else
        rm -f "$HOME/.config/systemd/user/korrid.service"
      fi
      systemctl --user daemon-reload
      if [[ -n "$previous_current" ]]; then
        systemctl --user restart korrid.service || true
      else
        systemctl --user stop korrid.service || true
      fi
      echo "korrid deployment rolled back after failed health check" >&2
    }
    trap rollback_install ERR

    ln -sfn "$profile" "$HOME/.local/state/korrid/current.next"
    mv -Tf \
      "$HOME/.local/state/korrid/current.next" \
      "$HOME/.local/state/korrid/current"
    install -m 0644 "$handoff/korrid.service" \
      "$HOME/.config/systemd/user/korrid.service"
    install -m 0644 "$handoff/host.toml" \
      "$HOME/.config/korrid/host.toml"
    install -m 0755 "$handoff/zao-remote.sh" \
      "$HOME/.local/libexec/korrid-deploy"
    systemctl --user daemon-reload
    systemctl --user enable korrid.service
    systemctl --user restart korrid.service

    healthy=false
    for _ in $(seq 1 40); do
      if response="$(curl --fail --silent --connect-timeout 1 --max-time 2 \
        http://127.0.0.1:43117/rpc \
        -H 'content-type: application/json' \
        -d '{"_tag":"app.catalog.snapshot","payload":{}}')" && \
        [[ "$response" == *'"id":"neverball"'* ]] && \
        [[ "$response" == *'"host":"zao"'* ]]; then
        healthy=true
        break
      fi
      sleep 0.25
    done
    if [[ "$healthy" != true ]]; then
      echo "candidate korrid did not serve the expected Neverball catalog" >&2
      false
    fi

    printf '%s\n' "$revision" > "$HOME/.local/state/korrid/deployed-revision"
    trap - ERR
    ;;
  provision-game)
    nix profile install nixpkgs#neverball
    ;;
  restart)
    systemctl --user restart korrid.service
    ;;
  logs)
    exec journalctl --user -u korrid.service -n 100 --no-pager
    ;;
  *)
    echo "usage: $0 {install <store-path> <handoff-dir>|provision-game|restart|logs}" >&2
    exit 2
    ;;
esac
