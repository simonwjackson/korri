{
  pkgs,
  korriSteamSourceMachineModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  evaluateWith =
    hostSystem:
    evalConfig {
      system = hostSystem;
      modules = [
        korriSteamSourceMachineModule
        (
          { ... }:
          {
            nixpkgs.hostPlatform = hostSystem;
            nixpkgs.config.allowUnfree = true;
            boot.loader.grub.devices = [ "nodev" ];
            fileSystems."/" = {
              device = "/dev/null";
              fsType = "ext4";
            };
            system.stateVersion = "24.11";
            services.korri.runtime = {
              user = "simonwjackson";
              group = "users";
              home = "/home/simonwjackson";
              stateRoot = "/var/lib/korri";
              createUser = false;
            };
            users.groups.users = { };
            users.users.simonwjackson = {
              isNormalUser = true;
              group = "users";
              home = "/home/simonwjackson";
            };
          }
        )
      ];
    };

  evaluated = evaluateWith "x86_64-linux";
  cfg = evaluated.config;
  daemonEnv = cfg.systemd.user.services.korrid.environment or { };
  sessiondEnv = cfg.systemd.user.services.korri-sessiond.environment or { };
  systemPackages = cfg.environment.systemPackages or [ ];
  packageName = package: package.pname or package.name or "";
  findPackage =
    expected: lib.findFirst (package: packageName package == expected) null systemPackages;
  findPackagePrefix =
    expected: lib.findFirst (package: lib.hasPrefix expected (packageName package)) null systemPackages;
  protonCachyosX86Package = findPackagePrefix "proton-cachyos-x86_64";
  systemPackagePaths = lib.concatStringsSep " " (map toString systemPackages);
  hasPackage = expected: findPackage expected != null;
  hasPackagePrefix = expected: findPackagePrefix expected != null;
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "Steam source-machine module evaluates on x86_64" (
      builtins.filter (a: !a.assertion) cfg.assertions == [ ]
    ))
    (check "Steam source-machine module exposes native install helper to korrid" (
      lib.hasSuffix "/bin/korri-steam-x86-app-install" daemonEnv.KORRI_STEAM_APP_INSTALL_HELPER
    ))
    (check "Steam source-machine module provides Steam and Korri wrapper packages" (
      hasPackage "steam" && hasPackage "korri-steam-app" && hasPackage "korri-steam-x86-app-install"
    ))
    (check "Steam source-machine module provides x86 CachyOS Proton metadata" (
      daemonEnv.KORRI_STEAM_X86_COMPAT_TOOL == "proton-cachyos-11.0-20260601-slr-x86_64"
      && hasPackagePrefix "proton-cachyos-x86_64"
    ))
    (check "Steam source-machine module materializes CachyOS Proton under Steam home" (
      builtins.any (
        rule:
        lib.hasInfix "/var/lib/korri/steam/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-x86_64" rule
      ) cfg.systemd.tmpfiles.rules
    ))
    (check "Steam source-machine module does not enable plugin ids itself" (
      !(daemonEnv ? KORRI_ENABLED_PLUGINS) && !(sessiondEnv ? KORRI_ENABLED_PLUGINS)
    ))
    (check "Steam source-machine module does not import ARM Steam services" (
      !(cfg.systemd.services ? korri-steam-gamescope)
      && !(cfg.systemd.services ? korri-steam-prepare-fex-rootfs)
      && !(cfg.systemd.services ? korri-steam-seed)
      && !(daemonEnv ? FEX_ROOTFS)
      && !(sessiondEnv ? FEX_ROOTFS)
      && !(cfg.users.groups ? korri-steam-input)
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri Steam source-machine module check failed:\n${
    lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures
  }"
else
  pkgs.runCommand "korri-steam-source-machine-module-check" { } ''
    found_stateful_app=0
    found_detached_install=0
    for package in ${systemPackagePaths}; do
      if [ -x "$package/bin/korri-steam-app" ] \
        && grep -q 'export HOME=/var/lib/korri/steam' "$package/bin/korri-steam-app" \
        && grep -q 'STEAM_COMPAT_CLIENT_INSTALL_PATH=/var/lib/korri/steam' "$package/bin/korri-steam-app"; then
        found_stateful_app=1
      fi
      if [ -x "$package/bin/korri-steam-x86-app-install" ] \
        && grep -q 'nohup .* +app_install' "$package/bin/korri-steam-x86-app-install"; then
        found_detached_install=1
      fi
    done
    test "$found_stateful_app" -eq 1
    test "$found_detached_install" -eq 1
    test -f ${protonCachyosX86Package}/${protonCachyosX86Package.passthru.dist}/compatibilitytool.vdf
    echo "All ${toString (builtins.length checks)} korri Steam source-machine checks passed."
    touch $out
  ''
