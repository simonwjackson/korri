#!/usr/bin/env -S nix shell nixpkgs#bash nixpkgs#coreutils nixpkgs#gnugrep nixpkgs#gnused nixpkgs#procps nixpkgs#perl nixpkgs#gamescope nixpkgs#mangohud --command bash
# Bare-minimum Korri-owned Steam LaunchOptions prototype for 30XX (Steam AppID 1029210).
#
# Modes:
#   reconcile [wrapper-path]
#     Close Steam, then write the 30XX LaunchOptions VDF entry to call this wrapper.
#   launch --appid 1029210 -- <steam-expanded-command...>
#     Run the Steam-expanded game command under MangoHud + Gamescope at 640x360.
#   --appid 1029210 -- <steam-expanded-command...>
#     Same as launch; this is the form Steam invokes from LaunchOptions.
#
# Defaults:
#   KORRI_STEAM_ROOT=/var/lib/korri/steam
#   KORRI_STEAM_LOCALCONFIG explicitly overrides auto-detection

set -euo pipefail

APPID="1029210"
GAME_NAME="30XX"
STEAM_ROOT="${KORRI_STEAM_ROOT:-/var/lib/korri/steam}"

find_steam_localconfig() {
  if [[ -n "${KORRI_STEAM_LOCALCONFIG:-}" ]]; then
    printf '%s\n' "$KORRI_STEAM_LOCALCONFIG"
    return 0
  fi

  local candidate
  # Steam normally uses the numeric account id under userdata/, not userdata/0.
  # Prefer a real account localconfig that already mentions the target AppID;
  # userdata/0 is only a fallback skeleton and Steam ignored it on Bandai.
  for candidate in "$STEAM_ROOT"/userdata/*/config/localconfig.vdf; do
    [[ -f "$candidate" ]] || continue
    [[ "$candidate" == "$STEAM_ROOT/userdata/0/config/localconfig.vdf" ]] && continue
    if grep -qF "\"$APPID\"" "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  for candidate in "$STEAM_ROOT"/userdata/*/config/localconfig.vdf; do
    [[ -f "$candidate" ]] || continue
    if grep -qF "\"$APPID\"" "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  # Fallback for fresh/prototype setups.
  printf '%s\n' "$STEAM_ROOT/userdata/0/config/localconfig.vdf"
}

LOCALCONFIG="$(find_steam_localconfig)"

choose_log_file() {
  if [[ -n "${KORRI_STEAM_WRAPPER_LOG:-}" ]]; then
    printf '%s\n' "$KORRI_STEAM_WRAPPER_LOG"
    return 0
  fi
  if mkdir -p "$STEAM_ROOT/logs" 2>/dev/null && [[ -w "$STEAM_ROOT/logs" ]]; then
    printf '%s\n' "$STEAM_ROOT/logs/korri-steam-30xx-gamescope-launch.log"
    return 0
  fi
  printf '/tmp/korri-steam-30xx-gamescope-launch.%s.log\n' "$(id -u)"
}

LOG_FILE="$(choose_log_file)"

log() {
  local line
  line="$(date -Is) $*"
  printf '%s\n' "$line" >&2
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

usage() {
  cat >&2 <<USAGE
Usage:
  $0 reconcile [wrapper-path]
  $0 launch --appid 1029210 -- <steam-expanded-command...>
  $0 --appid 1029210 -- <steam-expanded-command...>

Environment:
  KORRI_STEAM_ROOT          Default: /var/lib/korri/steam
  KORRI_STEAM_LOCALCONFIG   Default: \$KORRI_STEAM_ROOT/userdata/0/config/localconfig.vdf
USAGE
}

steam_pids() {
  # Check all users: this may be run from a root SSH shell while Steam itself
  # belongs to the kiosk/korri user. VDF writes are only safe once no Steam
  # process is alive anywhere on the host.
  pgrep -f '(^|/)(steam|steamwebhelper|steam-runtime|steam-runtime-supervisor)( |$)' || true
}

ensure_steam_closed_before_vdf_write() {
  local pids
  pids="$(steam_pids)"
  if [[ -z "$pids" ]]; then
    log "Steam is already closed; safe to write $LOCALCONFIG"
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
      log "Steam closed; safe to write $LOCALCONFIG"
      return 0
    fi
  done

  log "Refusing to write VDF because Steam is still running: ${pids//$'\n'/ }"
  return 1
}

realpath_portable() {
  readlink -f "$1"
}

reconcile_30xx_launch_options() {
  local wrapper_path="${1:-$0}"
  wrapper_path="$(realpath_portable "$wrapper_path")"

  if [[ "$wrapper_path" =~ [[:space:]] ]]; then
    log "Refusing wrapper path with whitespace because Steam LaunchOptions quoting is intentionally minimal: $wrapper_path"
    return 1
  fi
  if [[ ! -x "$wrapper_path" ]]; then
    log "Refusing non-executable wrapper path: $wrapper_path"
    return 1
  fi

  ensure_steam_closed_before_vdf_write

  local desired_launch_options
  # Steam's app-launch environment is a FHS/container-ish shell where the nix
  # shebang is not reliable. Keep this file nix-runnable for admin/reconcile
  # use, but make Steam invoke it through the system bash explicitly.
  desired_launch_options="/run/current-system/sw/bin/bash $wrapper_path --appid $APPID -- %command%"
  log "Reconciling $GAME_NAME LaunchOptions for AppID $APPID"
  log "Desired LaunchOptions: $desired_launch_options"

  LOCALCONFIG="$LOCALCONFIG" APPID="$APPID" DESIRED_LAUNCH_OPTIONS="$desired_launch_options" perl <<'PL'
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
  my $backup = $path . ".korri-30xx." . time() . ".bak";
  copy($path, $backup) or die "backup $backup: $!";
  print "backup: $backup\n";
}
my $tmp = $path . ".korri-30xx.$$" . ".tmp";
open my $fh, ">", $tmp or die "write $tmp: $!";
print {$fh} $rendered;
close $fh or die "close $tmp: $!";
move($tmp, $path) or die "replace $path: $!";
print "wrote: $path\n";
print "old LaunchOptions: " . (defined($old) ? "'$old'" : "undef") . "\n";
print "new LaunchOptions: '$desired'\n";
PL
}

launch_30xx() {
  if [[ "${1:-}" != "--appid" || "${2:-}" != "$APPID" || "${3:-}" != "--" ]]; then
    usage
    return 2
  fi
  shift 3
  if [[ "$#" -eq 0 ]]; then
    log "No Steam-expanded command received after --"
    return 2
  fi

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

  log "Launching $GAME_NAME AppID $APPID through MangoHud + Gamescope 640x360"
  log "Using gamescope: $gamescope_bin"
  log "Using mangohud: $mangohud_bin"
  log "Steam-expanded command: $*"

  export MANGOHUD=1
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
  log "Runtime env: XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-} LD_LIBRARY_PATH=${LD_LIBRARY_PATH:-}"
  log "Exec: $gamescope_bin -w 640 -h 360 -W 640 -H 360 --mangoapp -- $*"
  exec "$gamescope_bin" -w 640 -h 360 -W 640 -H 360 --mangoapp -- "$@" >>"$LOG_FILE" 2>&1
}

case "${1:-}" in
  reconcile)
    shift
    reconcile_30xx_launch_options "${1:-$0}"
    ;;
  launch)
    shift
    launch_30xx "$@"
    ;;
  --appid)
    launch_30xx "$@"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
