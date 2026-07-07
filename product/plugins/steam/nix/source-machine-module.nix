# Source-machine stream-host composition for the native x86 Steam plugin.
#
# This is intentionally separate from ./nixos-module.nix, which owns the
# SM8550/aarch64 Steam capsule. Source-machine hosts such as AKA use normal
# nixpkgs Steam plus plugin-owned wrappers that satisfy the shared TypeScript
# Steam plugin contracts.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  runtime = config.services.korri.runtime;

  # Native x86 Steam keeps auth/session state in the interactive user's Steam
  # home. Do not strand source-machine installs under runtime.stateRoot:
  # headless korrid can request installs, but Steam's remembered login lives in
  # the normal user profile that owns the Sway/Sunshine session.
  steamProfileHome = runtime.home;
  steamHome = "${steamProfileHome}/.local/share/Steam";
  protonCachyosX86 = pkgs.callPackage ../../proton-runtime/packages/proton-cachyos-x86_64 { };
  steamPackage = pkgs.steam;
  steamEnv = ''
    export HOME=${lib.escapeShellArg steamProfileHome}
    export XDG_DATA_HOME=${lib.escapeShellArg "${steamProfileHome}/.local/share"}
    export XDG_CONFIG_HOME=${lib.escapeShellArg "${steamProfileHome}/.config"}
    export XDG_CACHE_HOME=${lib.escapeShellArg "${steamProfileHome}/.cache"}
    export XDG_RUNTIME_DIR="''${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    export DBUS_SESSION_BUS_ADDRESS="''${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
    export STEAM_COMPAT_CLIENT_INSTALL_PATH=${lib.escapeShellArg steamHome}
  '';
  steamApp = pkgs.writeShellScriptBin "korri-steam-app" ''
    set -eu
    ${steamEnv}
    if [ "$#" -ne 1 ]; then
      echo "usage: korri-steam-app <appid>" >&2
      exit 64
    fi
    appid="$1"
    case "$appid" in
      ""|*[!0-9]*)
        echo "korri-steam-app: Steam AppID must be numeric" >&2
        exit 64
        ;;
    esac
    exec ${steamPackage}/bin/steam -vgui -applaunch "$appid"
  '';
  steamInstallOnDisplay = pkgs.writeShellScriptBin "korri-steam-x86-install-on-display" ''
    set -eu
    ${steamEnv}
    appid="$1"
    log="${steamHome}/steamapps/korri-app-install-$appid.log"
    mkdir -p "$(dirname "$log")"
    exec ${steamPackage}/bin/steam -vgui -console +app_install "$appid" >>"$log" 2>&1
  '';
  steamInstallHelper = pkgs.writeShellScriptBin "korri-steam-x86-app-install" ''
    set -eu
    ${steamEnv}
    if [ "$#" -ne 1 ]; then
      echo "usage: korri-steam-x86-app-install <appid>" >&2
      exit 64
    fi
    appid="$1"
    case "$appid" in
      ""|*[!0-9]*)
        echo "korri-steam-x86-app-install: Steam AppID must be numeric" >&2
        exit 64
        ;;
    esac
    export SWAYSOCK="''${SWAYSOCK:-$XDG_RUNTIME_DIR/sway-ipc.sock}"
    log="${steamHome}/steamapps/korri-app-install-$appid.log"
    mkdir -p "$(dirname "$log")"
    if [ -S "$SWAYSOCK" ]; then
      ${pkgs.sway}/bin/swaymsg exec "${steamInstallOnDisplay}/bin/korri-steam-x86-install-on-display $appid" >>"$log" 2>&1
    else
      nohup ${steamPackage}/bin/steam -vgui -console +app_install "$appid" >>"$log" 2>&1 &
    fi
    echo "korri-steam-x86-app-install: requested Steam install for $appid"
  '';
in
{
  config = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 {
    programs.steam.enable = lib.mkDefault true;

    environment.systemPackages = [
      steamPackage
      steamApp
      steamInstallHelper
      steamInstallOnDisplay
      protonCachyosX86
    ];

    systemd.tmpfiles.rules = [
      "d ${steamHome} 0750 ${runtime.user} ${runtime.group} -"
      "d ${steamHome}/steamapps 0750 ${runtime.user} ${runtime.group} -"
      "d ${steamHome}/compatibilitytools.d 0750 ${runtime.user} ${runtime.group} -"
      "L+ ${steamHome}/compatibilitytools.d/${protonCachyosX86.passthru.toolName} - - - - ${protonCachyosX86}/${protonCachyosX86.passthru.dist}"
    ];

    systemd.user.services.korrid = {
      path = [
        pkgs.coreutils
        pkgs.procps
        pkgs.systemd
      ];
      environment = {
        XDG_RUNTIME_DIR = "%t";
        WAYLAND_DISPLAY = "wayland-1";
        DBUS_SESSION_BUS_ADDRESS = "unix:path=%t/bus";
        SWAYSOCK = "%t/sway-ipc.sock";
        KORRI_STEAM_HOME = steamHome;
        KORRI_STEAM_APP_INSTALL_HELPER = "${steamInstallHelper}/bin/korri-steam-x86-app-install";
        KORRI_STEAM_X86_COMPAT_TOOL = protonCachyosX86.passthru.toolName;
        KORRI_STEAM_X86_COMPAT_TOOL_PATH = "${protonCachyosX86}/${protonCachyosX86.passthru.dist}";
      };
    };

  };
}
