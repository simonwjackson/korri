{
  pkgs,
  products,
  rg353mSystem,
  targetPackages,
  hostPackages,
  configurations,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  rg353mProduct = products.rg353m;
  cfg = rg353mSystem.config;
  server = cfg.services.korri.daemon;
  targetSystem = cfg.nixpkgs.hostPlatform.system;
  sessiondService = cfg.systemd.services."korri-sessiond" or { };
  sessiondEnv = sessiondService.environment or { };
  serverService = cfg.systemd.services."korrid" or { };
  serverEnv = serverService.environment or { };
  inputplumberService = cfg.systemd.services.inputplumber or { };
  inputplumberEnv = inputplumberService.environment or { };
  userCompositorService = cfg.systemd.user.services."korri-compositor" or { };
  userCompositorEnv = userCompositorService.environment or { };
  userCompositorServiceConfig = userCompositorService.serviceConfig or { };
  userCompositorUnsetEnvironment = userCompositorServiceConfig.UnsetEnvironment or [ ];
  userCompositorRequires = userCompositorService.requires or [ ];
  serverExecStartPre = serverService.serviceConfig.ExecStartPre or [ ];
  platformDefaults = server.library.platformDefaults;
  hostAppEnvironment = ((platformDefaults.host or { }).gamescope or { }).app.environment or { };
  renderedPlatformDefaults =
    (pkgs.formats.yaml { }).generate "00-korri-platform-defaults.yaml"
      platformDefaults;

  checks = [
    (check "RG353M kiosk configuration must be exposed" (
      lib.hasAttr rg353mProduct.configName configurations
    ))
    (check "RG353M target system package must be exposed" (
      lib.hasAttr rg353mProduct.kioskSystemPackageName targetPackages
    ))
    (check "RG353M host rootfs package must be exposed" (
      lib.hasAttr rg353mProduct.rootfsPackageName hostPackages
    ))
    (check "RG353M target system package must be a derivation" (
      (targetPackages.${rg353mProduct.kioskSystemPackageName} or null).drvPath or null != null
    ))
    (check "RG353M host rootfs package must be a derivation" (
      (hostPackages.${rg353mProduct.rootfsPackageName} or null).drvPath or null != null
    ))
    (check "RG353M evaluated target system must be aarch64-linux" (targetSystem == "aarch64-linux"))
    (check "RG353M server role must be enabled" server.enable)
    (check "RG353M server must run as a system service" (server.serviceMode == "system"))
    (check "RG353M sessiond must not set retired force-Xwayland env" (
      !(sessiondEnv ? KORRI_GAMESCOPE_FORCE_XWAYLAND)
    ))
    (check "RG353M korrid must not set retired force-Xwayland env" (
      !(serverEnv ? KORRI_GAMESCOPE_FORCE_XWAYLAND)
    ))
    (check "RG353M platform defaults must unset WAYLAND_DISPLAY at the host Gamescope app layer" (
      hostAppEnvironment ? WAYLAND_DISPLAY && hostAppEnvironment.WAYLAND_DISPLAY == null
    ))
    (check "RG353M compositor must not force Mesa's loader driver" (
      !(userCompositorEnv ? MESA_LOADER_DRIVER_OVERRIDE)
    ))
    (check "RG353M compositor must not force Gallium's driver" (!(userCompositorEnv ? GALLIUM_DRIVER)))
    (check "RG353M compositor must not inherit app display sockets" (
      builtins.elem "DISPLAY" userCompositorUnsetEnvironment
      && builtins.elem "WAYLAND_DISPLAY" userCompositorUnsetEnvironment
    ))
    (check "RG353M compositor must not require the retired main-space bus unit" (
      !(builtins.elem "main-space-session-dbus.service" userCompositorRequires)
    ))
    (check "RG353M platform-default fragment must be installed before korrid starts" (
      builtins.any (cmd: lib.hasInfix "00-korri-platform-defaults.yaml" cmd) serverExecStartPre
    ))
    (check "RG353M InputPlumber must discover product maps before package defaults" (
      lib.hasPrefix "/run/current-system/sw/share:" (inputplumberEnv.XDG_DATA_DIRS or "")
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri RK3566 kiosk config check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-rk3566-kiosk-config-check" { } ''
    set -eu
    mkdir -p "$out"
    grep -q 'host:' ${renderedPlatformDefaults}
    grep -q 'gamescope:' ${renderedPlatformDefaults}
    grep -q 'WAYLAND_DISPLAY: null' ${renderedPlatformDefaults}
    if grep -q 'retroarch:' ${renderedPlatformDefaults}; then
      echo "platform defaults must not define an apps.retroarch record" >&2
      exit 1
    fi
    if grep -q 'KORRI_GAMESCOPE_FORCE_XWAYLAND' ${renderedPlatformDefaults}; then
      echo "retired force-Xwayland env leaked into platform defaults" >&2
      exit 1
    fi
    cat > "$out/summary.txt" <<'EOF'
    Korri RockNix RK3566 config invariants passed.
    EOF
  ''
