{
  pkgs,
  inputdPackage,
  korridPackage,
}:

pkgs.writeShellApplication {
  name = "korri-dev";
  runtimeInputs = [
    pkgs.coreutils
  ];
  text = ''
    physical_input=disabled
    case "''${1:-}" in
      "") ;;
      --physical)
        physical_input=physical
        shift
        ;;
      *)
        echo "usage: korri-dev [--physical]" >&2
        exit 64
        ;;
    esac
    [[ "$#" -eq 0 ]] || {
      echo "usage: korri-dev [--physical]" >&2
      exit 64
    }

    runtime_parent="''${XDG_RUNTIME_DIR:-''${TMPDIR:-/tmp}}"
    runtime_root="$(mktemp -d "$runtime_parent/korri-dev.XXXXXXXX")"
    state_root="$runtime_root/state"
    storage_root="$runtime_root/storage"
    mkdir -p "$state_root" "$storage_root"
    cat >"$runtime_root/host.toml" <<'EOF'
    label = "development"
    EOF

    children=()
    # shellcheck disable=SC2329 # Invoked indirectly by the traps below.
    cleanup() {
      local pid
      trap - EXIT INT TERM
      for pid in "''${children[@]}"; do
        kill -TERM "$pid" 2>/dev/null || true
      done
      for pid in "''${children[@]}"; do
        wait "$pid" 2>/dev/null || true
      done
      rm -rf "$runtime_root"
    }
    trap cleanup EXIT INT TERM

    echo "Korri development runtime: $runtime_root"
    echo "Input source: $physical_input"
    if [[ "$physical_input" == disabled ]]; then
      echo "Physical input and all actions are disabled."
    else
      echo "Physical mode reads only the validated normalized InputPlumber target."
    fi

    KORRID_MODE=host \
      KORRID_ADDRESS=127.0.0.1:0 \
      KORRID_HOST_CONFIG="$runtime_root/host.toml" \
      KORRID_STORAGE_ROOT="$storage_root" \
      KORRID_PRIVATE_STATE_ROOT="$state_root" \
      ${korridPackage}/bin/korrid &
    children+=("$!")

    KORRI_INPUTD_PROFILE=development \
      KORRI_INPUTD_SOURCE="$physical_input" \
      ${inputdPackage}/bin/korri-inputd &
    children+=("$!")

    set +e
    wait -n "''${children[@]}"
    status=$?
    set -e
    if [[ "$status" -eq 0 ]]; then
      echo "A Korri development process exited unexpectedly." >&2
      exit 1
    fi
    exit "$status"
  '';
}
