#!/usr/bin/env -S nix shell nixpkgs#bash nixpkgs#coreutils nixpkgs#gnugrep nixpkgs#gnused nixpkgs#procps nixpkgs#perl nixpkgs#gamescope nixpkgs#mangohud --command bash
# EXPERIMENTAL / PARKED: do not wire this per-game wrapper into Steam
# LaunchOptions by default. Bandai validation showed that running only the game
# inside a nested/detached Gamescope boundary can break Steam Input for Stray.
# Prefer running Steam itself inside Gamescope for controller-sensitive games.
#
# Korri-owned Steam LaunchOptions wrapper for running Steam-expanded commands
# under host Gamescope with the gamescope-managed MangoHud overlay.
#
# Modes:
#   reconcile --appid <steam-appid> [wrapper-path]
#     Close Steam, then write the app's LaunchOptions VDF entry to call this wrapper.
#   launch --appid <steam-appid> -- <steam-expanded-command...>
#     Run the Steam-expanded command under MangoHud + Gamescope.
#   --appid <steam-appid> -- <steam-expanded-command...>
#     Same as launch; this is the form Steam invokes from LaunchOptions.
#
# Defaults:
#   KORRI_STEAM_ROOT=/var/lib/korri/steam
#   KORRI_STEAM_LOCALCONFIG explicitly overrides auto-detection
#   KORRI_GAMESCOPE_WIDTH=640
#   KORRI_GAMESCOPE_HEIGHT=360
#   KORRI_GAMESCOPE_OUTPUT_WIDTH=$KORRI_GAMESCOPE_WIDTH
#   KORRI_GAMESCOPE_OUTPUT_HEIGHT=$KORRI_GAMESCOPE_HEIGHT

set -euo pipefail

STEAM_ROOT="${KORRI_STEAM_ROOT:-/var/lib/korri/steam}"
LOG_FILE="${KORRI_STEAM_WRAPPER_LOG:-}"

usage() {
  cat >&2 <<USAGE
Usage:
  $0 reconcile --appid <steam-appid> [wrapper-path]
  $0 launch --appid <steam-appid> -- <steam-expanded-command...>
  $0 --appid <steam-appid> -- <steam-expanded-command...>

Environment:
  KORRI_STEAM_ROOT                   Default: /var/lib/korri/steam
  KORRI_STEAM_LOCALCONFIG            Override localconfig.vdf auto-detection
  KORRI_STEAM_WRAPPER_LOG            Override wrapper log path
  KORRI_GAMESCOPE_WIDTH              Default: 640
  KORRI_GAMESCOPE_HEIGHT             Default: 360
  KORRI_GAMESCOPE_OUTPUT_WIDTH       Default: KORRI_GAMESCOPE_WIDTH
  KORRI_GAMESCOPE_OUTPUT_HEIGHT      Default: KORRI_GAMESCOPE_HEIGHT
  KORRI_GAMESCOPE_BIN                Override gamescope binary
  KORRI_MANGOHUD_BIN                 Override mangohud binary used to find mangoapp
USAGE
}

validate_appid() {
  local appid="$1"
  if [[ -z "$appid" || ! "$appid" =~ ^[0-9]+$ ]]; then
    printf 'Invalid Steam AppID: %s\n' "$appid" >&2
    return 2
  fi
}

choose_log_file() {
  local appid="$1"
  if [[ -n "${KORRI_STEAM_WRAPPER_LOG:-}" ]]; then
    printf '%s\n' "$KORRI_STEAM_WRAPPER_LOG"
    return 0
  fi

  local candidate
  candidate="$STEAM_ROOT/logs/korri-steam-gamescope-launch-$appid.log"
  if mkdir -p "$STEAM_ROOT/logs" 2>/dev/null && { : >> "$candidate"; } 2>/dev/null; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="/tmp/korri-steam-gamescope-launch-$appid.$(id -u).log"
  : >> "$candidate" 2>/dev/null || true
  printf '%s\n' "$candidate"
}

set_log_file_for_appid() {
  local appid="$1"
  if [[ -z "$LOG_FILE" ]]; then
    LOG_FILE="$(choose_log_file "$appid")"
  fi
}

log() {
  local line
  line="$(date -Is) $*"
  printf '%s\n' "$line" >&2
  if [[ -n "${LOG_FILE:-}" ]]; then
    mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
  fi
}

find_steam_localconfig() {
  local appid="$1"
  if [[ -n "${KORRI_STEAM_LOCALCONFIG:-}" ]]; then
    printf '%s\n' "$KORRI_STEAM_LOCALCONFIG"
    return 0
  fi

  local candidate
  # Steam normally uses the numeric account id under userdata/, not userdata/0.
  # Prefer a real account localconfig that already mentions the target AppID;
  # userdata/0 is only a fallback skeleton and Steam can ignore it.
  for candidate in "$STEAM_ROOT"/userdata/*/config/localconfig.vdf; do
    [[ -f "$candidate" ]] || continue
    [[ "$candidate" == "$STEAM_ROOT/userdata/0/config/localconfig.vdf" ]] && continue
    if grep -qF "\"$appid\"" "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  for candidate in "$STEAM_ROOT"/userdata/*/config/localconfig.vdf; do
    [[ -f "$candidate" ]] || continue
    if grep -qF "\"$appid\"" "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  # Fallback for fresh/prototype setups.
  printf '%s\n' "$STEAM_ROOT/userdata/0/config/localconfig.vdf"
}

steam_pids() {
  # Check all users: this may be run from a root SSH shell while Steam itself
  # belongs to the kiosk/korri user. VDF writes are only safe once no Steam
  # process is alive anywhere on the host.
  pgrep -f '(^|/)(steam|steamwebhelper|steam-runtime|steam-runtime-supervisor)( |$)' || true
}

ensure_steam_closed_before_vdf_write() {
  local localconfig="$1"
  local pids
  pids="$(steam_pids)"
  if [[ -z "$pids" ]]; then
    log "Steam is already closed; safe to write $localconfig"
    return 0
  fi

  log "Steam is running; asking it to shut down before VDF write: ${pids//$'\n'/ }"
  if command -v steam >/dev/null 2>&1; then
    steam -shutdown >/dev/null 2>&1 || true
  fi
  pkill -TERM -f '(^|/)(steam|steamwebhelper|steam-runtime|steam-runtime-supervisor)( |$)' >/dev/null 2>&1 || true

  for _ in $(seq 1 60); do
    sleep 1
    pids="$(steam_pids)"
    if [[ -z "$pids" ]]; then
      log "Steam closed; safe to write $localconfig"
      return 0
    fi
  done

  log "Refusing to write VDF because Steam is still running: ${pids//$'\n'/ }"
  return 1
}

realpath_portable() {
  readlink -f "$1"
}

reconcile_launch_options() {
  local appid="${KORRI_STEAM_APPID:-}"
  local wrapper_path=""

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --appid)
        appid="${2:-}"
        shift 2
        ;;
      --wrapper-path)
        wrapper_path="${2:-}"
        shift 2
        ;;
      --)
        shift
        break
        ;;
      -h|--help|help)
        usage
        return 0
        ;;
      *)
        if [[ -z "$wrapper_path" ]]; then
          wrapper_path="$1"
          shift
        else
          usage
          return 2
        fi
        ;;
    esac
  done

  validate_appid "$appid"
  set_log_file_for_appid "$appid"

  wrapper_path="${wrapper_path:-$0}"
  wrapper_path="$(realpath_portable "$wrapper_path")"

  if [[ "$wrapper_path" =~ [[:space:]] ]]; then
    log "Refusing wrapper path with whitespace because Steam LaunchOptions quoting is intentionally minimal: $wrapper_path"
    return 1
  fi
  if [[ ! -x "$wrapper_path" ]]; then
    log "Refusing non-executable wrapper path: $wrapper_path"
    return 1
  fi

  local localconfig
  localconfig="$(find_steam_localconfig "$appid")"
  ensure_steam_closed_before_vdf_write "$localconfig"

  local desired_launch_options
  # Steam's app-launch environment is a FHS/container-ish shell where the nix
  # shebang is not reliable. Keep this file nix-runnable for admin/reconcile
  # use, but make Steam invoke it through the system bash explicitly.
  desired_launch_options="/run/current-system/sw/bin/bash $wrapper_path --appid $appid -- %command%"
  log "Reconciling Steam LaunchOptions for AppID $appid"
  log "Desired LaunchOptions: $desired_launch_options"

  LOCALCONFIG="$localconfig" APPID="$appid" DESIRED_LAUNCH_OPTIONS="$desired_launch_options" perl <<'PL'
use strict;
use warnings;
use File::Basename qw(dirname);
use File::Path qw(make_path);
use File::Copy qw(copy move);

my $path = $ENV{"LOCALCONFIG"};
my $appid = $ENV{"APPID"};
my $desired = $ENV{"DESIRED_LAUNCH_OPTIONS"};

sub slurp {
  my ($file) = @_;
  return "" unless -e $file;
  open my $fh, "<", $file or die "read $file: $!";
  local $/;
  return <$fh>;
}

sub unescape_vdf {
  my ($value) = @_;
  $value =~ s/\\"/"/g;
  $value =~ s/\\\\/\\/g;
  return $value;
}

sub escape_vdf {
  my ($value) = @_;
  $value =~ s/\\/\\\\/g;
  $value =~ s/"/\\"/g;
  return $value;
}

my $text = slurp($path);
my @tokens;
my $pos = 0;
while ($text =~ /"((?:\\.|[^"\\])*)"|(\{)|(\})/g) {
  die "unexpected unquoted VDF content near byte $pos" if substr($text, $pos, $-[0] - $pos) =~ /\S/;
  if (defined $1) { push @tokens, ["string", unescape_vdf($1)]; }
  elsif (defined $2) { push @tokens, ["open", "{"]; }
  else { push @tokens, ["close", "}"]; }
  $pos = $+[0];
}
die "unexpected trailing VDF content near byte $pos" if substr($text, $pos) =~ /\S/;

my $index = 0;
sub parse_object {
  my ($stop_on_close) = @_;
  my @obj;
  while ($index < @tokens) {
    my ($kind, $value) = @{$tokens[$index]};
    if ($kind eq "close") {
      return \@obj if $stop_on_close && ++$index;
      die "unexpected closing brace";
    }
    die "expected key string" unless $kind eq "string";
    my $key = $value;
    $index++;
    die "missing value for key '$key'" if $index >= @tokens;
    my ($next_kind, $next_value) = @{$tokens[$index]};
    if ($next_kind eq "open") {
      $index++;
      push @obj, [$key, parse_object(1)];
    } elsif ($next_kind eq "string") {
      $index++;
      push @obj, [$key, $next_value];
    } else {
      die "unexpected token after key '$key'";
    }
  }
  die "missing closing brace" if $stop_on_close;
  return \@obj;
}

sub find_child {
  my ($obj, $key) = @_;
  for my $pair (@$obj) {
    if ($pair->[0] eq $key) {
      $pair->[1] = [] unless ref($pair->[1]) eq "ARRAY";
      return $pair->[1];
    }
  }
  my $child = [];
  push @$obj, [$key, $child];
  return $child;
}

sub set_value {
  my ($obj, $key, $value) = @_;
  for my $pair (@$obj) {
    if ($pair->[0] eq $key) {
      my $old = ref($pair->[1]) eq "ARRAY" ? undef : $pair->[1];
      $pair->[1] = $value;
      return $old;
    }
  }
  push @$obj, [$key, $value];
  return undef;
}

sub render_object {
  my ($obj, $indent) = @_;
  my $pad = "\t" x $indent;
  my $out = "";
  for my $pair (@$obj) {
    my ($key, $value) = @$pair;
    if (ref($value) eq "ARRAY") {
      $out .= $pad . '"' . escape_vdf($key) . '"' . "\n";
      $out .= $pad . "{\n";
      $out .= render_object($value, $indent + 1);
      $out .= $pad . "}\n";
    } else {
      $out .= $pad . '"' . escape_vdf($key) . '"' . "\t\t" . '"' . escape_vdf($value) . '"' . "\n";
    }
  }
  return $out;
}

my $root = $text =~ /\S/ ? parse_object(0) : [];
my $apps = find_child(find_child(find_child(find_child(find_child($root, "UserLocalConfigStore"), "Software"), "Valve"), "Steam"), "apps");
my $app = find_child($apps, $appid);
my $old = set_value($app, "LaunchOptions", $desired);
my $rendered = render_object($root, 0);

if ($text eq $rendered) {
  print "unchanged: $path\n";
  exit 0;
}

make_path(dirname($path));
if (-e $path) {
  my $backup = $path . ".korri-gamescope-" . $appid . "." . time() . ".bak";
  copy($path, $backup) or die "backup $backup: $!";
  print "backup: $backup\n";
}
my $tmp = $path . ".korri-gamescope-" . $appid . ".$$" . ".tmp";
open my $fh, ">", $tmp or die "write $tmp: $!";
print {$fh} $rendered;
close $fh or die "close $tmp: $!";
move($tmp, $path) or die "replace $path: $!";
print "wrote: $path\n";
print "old LaunchOptions: " . (defined($old) ? "'$old'" : "undef") . "\n";
print "new LaunchOptions: '$desired'\n";
PL
}

launch_app() {
  local appid="${KORRI_STEAM_APPID:-}"
  if [[ "${1:-}" == "--appid" ]]; then
    appid="${2:-}"
    shift 2
  fi
  if [[ "${1:-}" != "--" ]]; then
    usage
    return 2
  fi
  shift

  validate_appid "$appid"
  set_log_file_for_appid "$appid"

  if [[ "$#" -eq 0 ]]; then
    log "No Steam-expanded command received after --"
    return 2
  fi

  # Steam's overlay preload is for the game process, but this wrapper first
  # runs native host tools (`find`, gamescope, mangoapp). On Bandai the preload
  # makes mangoapp fail GLX context creation and respawn continuously, so keep
  # the wrapper host-clean from this point forward.
  local original_ld_preload="${LD_PRELOAD:-}"
  unset LD_PRELOAD

  local gamescope_bin mangohud_bin
  gamescope_bin="${KORRI_GAMESCOPE_BIN:-}"
  mangohud_bin="${KORRI_MANGOHUD_BIN:-}"
  if [[ -z "$gamescope_bin" ]]; then
    # Prefer the host/current Nix closure over Steam's inherited PATH. Steam's
    # FHS launch environment can expose older gamescope wrappers that miss the
    # current host runtime library setup.
    gamescope_bin="$(cd / && find /nix/store -maxdepth 3 -path '*/bin/gamescope' 2>/dev/null | grep gamescope-korri | sort | tail -1 || true)"
  fi
  if [[ -z "$gamescope_bin" ]]; then
    gamescope_bin="$(cd / && find /nix/store -maxdepth 3 -path '*/bin/gamescope' 2>/dev/null | sort | tail -1 || true)"
  fi
  if [[ -z "$gamescope_bin" ]]; then
    gamescope_bin="$(command -v gamescope || true)"
  fi
  if [[ -z "$mangohud_bin" ]]; then
    mangohud_bin="$(cd / && find /nix/store -maxdepth 3 -path '*/bin/mangohud' 2>/dev/null | sort | tail -1 || true)"
  fi
  if [[ -z "$mangohud_bin" ]]; then
    mangohud_bin="$(command -v mangohud || true)"
  fi
  if [[ -z "$gamescope_bin" || -z "$mangohud_bin" ]]; then
    log "Missing gamescope/mangohud: gamescope='$gamescope_bin' mangohud='$mangohud_bin'"
    return 127
  fi

  local width height output_width output_height
  width="${KORRI_GAMESCOPE_WIDTH:-640}"
  height="${KORRI_GAMESCOPE_HEIGHT:-360}"
  output_width="${KORRI_GAMESCOPE_OUTPUT_WIDTH:-$width}"
  output_height="${KORRI_GAMESCOPE_OUTPUT_HEIGHT:-$height}"

  log "Launching Steam AppID $appid through MangoHud + Gamescope ${width}x${height}"
  log "Using gamescope: $gamescope_bin"
  log "Using mangohud: $mangohud_bin"
  log "Steam-expanded command: $*"

  # `gamescope --mangoapp` owns the overlay. Do not export MANGOHUD=1 here:
  # that injects a second, inner MangoHud into the Proton/game process.
  unset MANGOHUD
  export MANGOHUD_CONFIG="${MANGOHUD_CONFIG:-position=top-left,font_size=24,fps,frametime,gpu_stats,cpu_stats,resolution}"
  # Steam launches this from its ARM64 FHS/container environment. The Nix
  # gamescope wrapper does not carry the host OpenGL driver path, so make it
  # explicit before the real gamescope binary resolves libGL/libEGL.
  local gl_library_paths=()
  [[ -d /run/opengl-driver/lib ]] && gl_library_paths+=("/run/opengl-driver/lib")
  while IFS= read -r gl_file; do
    gl_library_paths+=("$(dirname "$gl_file")")
  done < <(cd / && find /nix/store -maxdepth 4 -path '*-libglvnd-*/lib/libGL.so.1' 2>/dev/null | sort)
  if [[ "${#gl_library_paths[@]}" -gt 0 ]]; then
    local joined_gl_paths
    joined_gl_paths="$(IFS=:; printf '%s' "${gl_library_paths[*]}")"
    export LD_LIBRARY_PATH="$joined_gl_paths${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
  if [[ -z "${XDG_RUNTIME_DIR:-}" || ! -d "${XDG_RUNTIME_DIR:-}" || ! -w "${XDG_RUNTIME_DIR:-}" ]]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  fi
  # gamescope --mangoapp spawns a sibling `mangoapp` process by name.
  # Steam's launch environment does not include the MangoHud package in PATH.
  export PATH="$(dirname "$mangohud_bin"):$PATH"

  local -a child_command gamescope_args
  child_command=("$@")
  if [[ -n "$original_ld_preload" ]]; then
    local env_bin
    env_bin="${KORRI_ENV_BIN:-}"
    if [[ -z "$env_bin" && -x /run/current-system/sw/bin/env ]]; then
      env_bin="/run/current-system/sw/bin/env"
    fi
    if [[ -z "$env_bin" ]]; then
      env_bin="$(command -v env || true)"
    fi
    if [[ -n "$env_bin" ]]; then
      child_command=("$env_bin" "LD_PRELOAD=$original_ld_preload" "${child_command[@]}")
    else
      log "Could not find env; launching child without restoring Steam LD_PRELOAD"
    fi
  fi

  gamescope_args=()
  if [[ -n "${KORRI_GAMESCOPE_EXTRA_ARGS:-}" ]]; then
    # Intentionally shell-split for operator/debug overrides such as:
    # KORRI_GAMESCOPE_EXTRA_ARGS='-f --force-windows-fullscreen'
    # Production policy should graduate to structured launch config instead.
    # shellcheck disable=SC2206
    gamescope_args=(${KORRI_GAMESCOPE_EXTRA_ARGS})
  fi

  log "Runtime env: XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-} LD_LIBRARY_PATH=${LD_LIBRARY_PATH:-} stripped_LD_PRELOAD=${original_ld_preload:-} child_restores_LD_PRELOAD=$([[ -n "$original_ld_preload" ]] && printf yes || printf no) MANGOHUD=${MANGOHUD:-} gamescope_extra_args=${KORRI_GAMESCOPE_EXTRA_ARGS:-}"
  log "Exec: $gamescope_bin ${gamescope_args[*]} -w $width -h $height -W $output_width -H $output_height --mangoapp -- ${child_command[*]}"
  exec "$gamescope_bin" "${gamescope_args[@]}" -w "$width" -h "$height" -W "$output_width" -H "$output_height" --mangoapp -- "${child_command[@]}" >>"$LOG_FILE" 2>&1
}

case "${1:-}" in
  reconcile)
    shift
    reconcile_launch_options "$@"
    ;;
  launch)
    shift
    launch_app "$@"
    ;;
  --appid)
    launch_app "$@"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
