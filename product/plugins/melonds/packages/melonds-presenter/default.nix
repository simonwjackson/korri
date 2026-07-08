{ pkgs }:

pkgs.writeShellApplication {
  name = "korri-melonds-presenter";
  runtimeInputs = [
    pkgs.coreutils
    pkgs.gnused
    pkgs.jq
    pkgs.sway
  ];
  text = ''
    set -euo pipefail

    usage() {
      echo "usage: korri-melonds-presenter [--validate-only] --payload <matched-dual-screen.json>" >&2
    }

    validate_only=0
    payload=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --help|-h)
          usage
          exit 0
          ;;
        --validate-only)
          validate_only=1
          shift
          ;;
        --payload)
          payload="''${2-}"
          shift 2
          ;;
        *)
          usage
          exit 64
          ;;
      esac
    done

    if [ -z "$payload" ] || [ ! -f "$payload" ]; then
      usage
      exit 64
    fi

    require_safe_token() {
      local label="$1"
      local value="$2"
      if ! printf '%s' "$value" | grep -Eq '^[]A-Za-z0-9_.: [-]+$'; then
        echo "unsafe $label in melonDS presenter payload" >&2
        exit 65
      fi
    }

    require_safe_path() {
      local label="$1"
      local value="$2"
      case "$value" in
        *$'\n'*|*$'\r'*)
          echo "unsafe $label in melonDS presenter payload" >&2
          exit 65
          ;;
      esac
    }

    regex_escape() {
      printf '%s' "$1" | sed 's/[][\\.^$*+?(){}|]/\\\\&/g'
    }

    melonds_cmd="$(jq -er '.melonDs.command' "$payload")"
    app_id="$(jq -er '.selectors.appId' "$payload")"
    top_title="$(jq -er '.selectors.topTitlePrefix' "$payload")"
    bottom_title="$(jq -er '.selectors.bottomTitlePrefix' "$payload")"
    secondary_output="$(jq -er '.secondaryOutput.output // .windows.bottom.output' "$payload")"
    restore_policy="$(jq -er '.secondaryOutput.restore // "observed"' "$payload")"
    stylesheet="$(jq -r '.stylesheet // empty' "$payload")"

    require_safe_path melonDs.command "$melonds_cmd"
    require_safe_token app_id "$app_id"
    require_safe_token top_title "$top_title"
    require_safe_token bottom_title "$bottom_title"
    require_safe_token secondary_output "$secondary_output"
    case "$restore_policy" in
      observed|on|off) ;;
      *) echo "invalid secondaryOutput.restore in melonDS presenter payload" >&2; exit 65 ;;
    esac
    if [ -n "$stylesheet" ]; then
      require_safe_path stylesheet "$stylesheet"
    fi
    for rect_key in top bottom; do
      require_safe_token "windows.$rect_key.output" "$(jq -er ".windows.$rect_key.output" "$payload")"
      jq -er ".windows.$rect_key.x | numbers" "$payload" >/dev/null
      jq -er ".windows.$rect_key.y | numbers" "$payload" >/dev/null
      jq -er ".windows.$rect_key.width | numbers" "$payload" >/dev/null
      jq -er ".windows.$rect_key.height | numbers" "$payload" >/dev/null
    done

    mapfile -t melonds_args < <(jq -er '.melonDs.args[]?' "$payload")
    for arg in "''${melonds_args[@]}"; do
      require_safe_path melonDs.args "$arg"
    done

    launcher_args=()
    if [ -n "$stylesheet" ]; then
      launcher_args+=("-stylesheet" "$stylesheet")
    fi
    launcher_args+=("''${melonds_args[@]}")

    if [ "$validate_only" = "1" ]; then
      exit 0
    fi

    prior_power="unknown"
    if swaymsg -t get_outputs >/tmp/korri-melonds-outputs.json 2>/dev/null; then
      prior_power="$(jq -r --arg output "$secondary_output" '.[] | select(.name == $output) | if .power then "on" else "off" end' /tmp/korri-melonds-outputs.json | head -n1)"
      prior_power="''${prior_power:-unknown}"
    fi

    restore_output() {
      local target_power="$restore_policy"
      if [ "$target_power" = "observed" ]; then
        target_power="$prior_power"
      fi
      case "$target_power" in
        on) swaymsg -- output "$secondary_output" power on >/dev/null 2>&1 || true ;;
        off) swaymsg -- output "$secondary_output" power off >/dev/null 2>&1 || true ;;
      esac
    }
    trap restore_output EXIT

    swaymsg -- output "$secondary_output" power on >/dev/null

    "$melonds_cmd" "''${launcher_args[@]}" &
    child="$!"

    wait_for_window() {
      local title_prefix="$1"
      local deadline=$((SECONDS + 10))
      while [ "$SECONDS" -lt "$deadline" ]; do
        local count
        count="$(swaymsg -t get_tree | jq --arg app_id "$app_id" --arg title "$title_prefix" '[.. | objects | select(.app_id? == $app_id and (.name? // "" | startswith($title)))] | length')"
        if [ "$count" = "1" ]; then
          return 0
        fi
        if [ "$count" != "0" ]; then
          echo "ambiguous melonDS window match for $title_prefix" >&2
          kill "$child" >/dev/null 2>&1 || true
          wait "$child" >/dev/null 2>&1 || true
          exit 66
        fi
        sleep 0.1
      done
      echo "timed out waiting for melonDS window $title_prefix" >&2
      kill "$child" >/dev/null 2>&1 || true
      wait "$child" >/dev/null 2>&1 || true
      exit 66
    }

    place_window() {
      local title_prefix="$1"
      local rect_key="$2"
      local output x y width height title_regex criteria
      output="$(jq -er ".windows.$rect_key.output" "$payload")"
      x="$(jq -er ".windows.$rect_key.x" "$payload")"
      y="$(jq -er ".windows.$rect_key.y" "$payload")"
      width="$(jq -er ".windows.$rect_key.width" "$payload")"
      height="$(jq -er ".windows.$rect_key.height" "$payload")"
      require_safe_token output "$output"
      title_regex="$(regex_escape "$title_prefix")"
      criteria="[app_id=\"$app_id\" title=\"^$title_regex\"]"
      swaymsg "$criteria" floating enable >/dev/null
      swaymsg "$criteria" move to output "$output" >/dev/null
      swaymsg "$criteria" resize set width "$width" px height "$height" px >/dev/null
      swaymsg "$criteria" move position "$x" "$y" >/dev/null
    }

    wait_for_window "$top_title"
    wait_for_window "$bottom_title"
    place_window "$top_title" top
    place_window "$bottom_title" bottom

    wait "$child"
  '';
}
