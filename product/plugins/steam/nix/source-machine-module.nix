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
  steamHome = "${runtime.stateRoot}/steam";
  protonCachyosX86 = pkgs.callPackage ../../proton-runtime/packages/proton-cachyos-x86_64 { };
  steamPackage = pkgs.steam;
  steamApp = pkgs.writeShellScriptBin "korri-steam-app" ''
    set -eu
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
    exec ${steamPackage}/bin/steam -applaunch "$appid"
  '';
  steamInstallHelper = pkgs.writeShellScriptBin "korri-steam-x86-app-install" ''
    set -eu
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
    exec ${steamPackage}/bin/steam -console +app_install "$appid"
  '';
in
{
  config = lib.mkIf pkgs.stdenv.hostPlatform.isx86_64 {
    programs.steam.enable = lib.mkDefault true;

    environment.systemPackages = [
      steamPackage
      steamApp
      steamInstallHelper
      protonCachyosX86
    ];

    systemd.tmpfiles.rules = [
      "d ${steamHome} 0750 ${runtime.user} ${runtime.group} -"
      "d ${steamHome}/steamapps 0750 ${runtime.user} ${runtime.group} -"
      "d ${steamHome}/compatibilitytools.d 0750 ${runtime.user} ${runtime.group} -"
      "L+ ${steamHome}/compatibilitytools.d/${protonCachyosX86.passthru.toolName} - - - - ${protonCachyosX86}/${protonCachyosX86.passthru.dist}"
    ];

    systemd.user.services.korrid.environment = {
      KORRI_STEAM_APP_INSTALL_HELPER = "${steamInstallHelper}/bin/korri-steam-x86-app-install";
      KORRI_STEAM_X86_COMPAT_TOOL = protonCachyosX86.passthru.toolName;
      KORRI_STEAM_X86_COMPAT_TOOL_PATH = "${protonCachyosX86}/${protonCachyosX86.passthru.dist}";
    };

  };
}
