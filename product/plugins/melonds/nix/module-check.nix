{
  pkgs,
  korriMelonDsModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  fakeMelonDs = pkgs.runCommand "fake-melonds" { } ''
    mkdir -p "$out/bin"
    cat > "$out/bin/melonDS" <<'EOF'
    #!/usr/bin/env sh
    exit 0
    EOF
    chmod +x "$out/bin/melonDS"
  '';
  fakePresenter = pkgs.runCommand "fake-melonds-presenter" { } ''
    mkdir -p "$out/bin"
    cat > "$out/bin/korri-melonds-presenter" <<'EOF'
    #!/usr/bin/env sh
    exit 0
    EOF
    chmod +x "$out/bin/korri-melonds-presenter"
  '';

  config = (evalConfig {
    system = pkgs.stdenv.hostPlatform.system;
    modules = [
      {
        nixpkgs.hostPlatform = pkgs.stdenv.hostPlatform.system;
        users.users.korri = {
          isSystemUser = true;
          group = "korri";
        };
        users.groups.korri = { };
        boot.loader.grub.devices = [ "nodev" ];
        fileSystems."/" = {
          device = "/dev/null";
          fsType = "ext4";
        };
        system.stateVersion = "24.11";
      }
      (korriMelonDsModule {
        melonDsPackage = fakeMelonDs;
        melonDsPresenterPackage = fakePresenter;
      })
    ];
  }).config;

  packageNames = map (package: package.name or "") config.environment.systemPackages;
  rules = config.systemd.tmpfiles.rules;
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "module adds melonDS to system packages" (
      builtins.any (name: lib.hasInfix "fake-melonds" name) packageNames
    ))
    (check "module adds melonDS presenter to system packages" (
      builtins.any (name: lib.hasInfix "fake-melonds-presenter" name) packageNames
    ))
    (check "module creates Korri-owned melonDS state directories" (
      builtins.elem "d /var/lib/korri/melonDS 0755 korri korri -" rules
      && builtins.elem "d /var/lib/korri/melonDS/saves 0755 korri korri -" rules
      && builtins.elem "d /var/lib/korri/melonDS/savestates 0755 korri korri -" rules
      && builtins.elem "d /var/lib/korri/melonDS/cheats 0755 korri korri -" rules
    ))
  ];
  failures = builtins.filter (item: !item.assertion) checks;
in
if failures != [ ] then
  throw "korri-melonds module check failed:\n${
    lib.concatMapStringsSep "\n" (item: "- ${item.message}") failures
  }"
else
  pkgs.runCommand "korri-melonds-module-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-melonds module checks passed."
    touch "$out"
  ''
