# Pure-Nix module-evaluation check for `services.korri.rpcs3`.
{
  pkgs,
  korriRpcs3Module,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  fakeRpcs3 = pkgs.runCommand "fake-rpcs3" { } ''
    mkdir -p "$out/bin"
    cat > "$out/bin/rpcs3" <<'EOF'
    #!/usr/bin/env sh
    exit 0
    EOF
    chmod +x "$out/bin/rpcs3"
  '';

  baseModule =
    { lib, ... }:
    {
      options.services.korri.runtime.stateRoot = lib.mkOption {
        type = lib.types.str;
        default = "/var/lib/korri";
      };
      options.services.korri.daemon.library.platformDefaults = lib.mkOption {
        type = lib.types.attrs;
        default = { };
      };

      config = {
        nixpkgs.hostPlatform = pkgs.stdenv.hostPlatform.system;
        boot.loader.grub.devices = [ "nodev" ];
        fileSystems."/" = {
          device = "/dev/null";
          fsType = "ext4";
        };
        system.stateVersion = "24.11";
      };
    };

  evaluateWith = overrides:
    (evalConfig {
      system = pkgs.stdenv.hostPlatform.system;
      modules = [
        baseModule
        korriRpcs3Module
        overrides
      ];
    }).config;

  enabled = evaluateWith {
    services.korri.rpcs3 = {
      enable = true;
      package = fakeRpcs3;
      gamesRoot = "/srv/lakes/towada/gaming/games/sony-playstation-3";
      stateRoot = "/srv/lakes/towada/gaming/games/sony-playstation-3/_dev_hdd0";
      firmwareSentinel = "dev_flash/sys/external/liblv2.sprx";
    };
  };

  disabled = evaluateWith { };
  platformDefaults = enabled.services.korri.daemon.library.platformDefaults;
  launcherDefaults = platformDefaults.launchers."@korri:rpcs3/rpcs3";
  pluginDefaults = platformDefaults.host.plugin."@korri:rpcs3";

  packageNames = map (package: package.name or "") enabled.environment.systemPackages;
  sessiondPathNames = map (package: package.name or "") (enabled.systemd.user.services.korri-sessiond.path or [ ]);
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "enable=false contributes no RPCS3 runtime package" (
      disabled.services.korri.daemon.library.platformDefaults == { }
      && !(disabled.systemd.user.services ? korri-sessiond)
    ))
    (check "enabled module adds RPCS3 to system packages and sessiond path" (
      builtins.any (name: lib.hasInfix "fake-rpcs3" name) packageNames
      && builtins.any (name: lib.hasInfix "fake-rpcs3" name) sessiondPathNames
    ))
    (check "enabled module renders PS3 games and state storage defaults" (
      platformDefaults.storage."@korri:rpcs3/ps3-games".root
        == "/srv/lakes/towada/gaming/games/sony-playstation-3"
      && platformDefaults.storage."@korri:rpcs3/state".root
        == "/srv/lakes/towada/gaming/games/sony-playstation-3/_dev_hdd0"
    ))
    (check "enabled module renders absolute RPCS3 launch command defaults" (
      lib.hasPrefix "/" launcherDefaults.command
      && lib.hasSuffix "/bin/rpcs3" launcherDefaults.command
      && launcherDefaults.policy.allowedCommands == [ launcherDefaults.command ]
      && pluginDefaults.command == launcherDefaults.command
    ))
    (check "enabled module renders firmware sentinel policy" (
      launcherDefaults.settings.plugin.firmware.sentinel
        == "dev_flash/sys/external/liblv2.sprx"
      && pluginDefaults.firmware.sentinel
        == "dev_flash/sys/external/liblv2.sprx"
    ))
  ];
  failures = builtins.filter (item: !item.assertion) checks;
in
if failures != [ ] then
  throw "korri-rpcs3 module check failed:\n${
    lib.concatMapStringsSep "\n" (item: "- ${item.message}") failures
  }"
else
  pkgs.runCommand "korri-rpcs3-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-rpcs3 module checks passed."
    touch "$out"
  ''
