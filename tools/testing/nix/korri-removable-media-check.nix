# Pure-Nix module-evaluation check for `services.korri.removableMedia`.
#
# Device-neutral: evaluates the shared removable-media module against a
# minimal fixture host and asserts the rendered units, udev rules, tmpfiles,
# matcher gates, and config-roots.d wiring — independent of any platform.
# Platform enablement postures are asserted by the per-platform config
# checks (SM8550, live USB); matcher *behavior* is proven by
# korri-removable-media-matcher.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-removable-media --no-link
{
  pkgs,
  korriRemovableMediaModule,
  matcherSource,
  moduleSource,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "removable-media-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriRemovableMediaModule
        baseModule
        overrides
      ];
    }).config;

  defaultOptions =
    (evalConfig {
      system = hostSystem;
      modules = [
        korriRemovableMediaModule
        baseModule
        { services.korri.removableMedia.enable = true; }
      ];
    }).options;

  defaults = evaluateWith {
    services.korri.removableMedia.enable = true;
  };

  withUsb = evaluateWith {
    services.korri.removableMedia = {
      enable = true;
      match.usb = true;
    };
  };

  withContentRoot = evaluateWith {
    services.korri.removableMedia = {
      enable = true;
      contentRoot = "/var/lib/korri/content/removable/cards";
    };
  };

  disabled = evaluateWith { };

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;

  mountUnit = cfg: cfg.systemd.services."korri-removable-media-mount@" or { };
  unmountUnit = cfg: cfg.systemd.services."korri-removable-media-unmount@" or { };
  coldplugUnit = cfg: cfg.systemd.services.korri-removable-media-coldplug or { };
  udevRules = cfg: cfg.services.udev.extraRules or "";

  matcherText = builtins.readFile matcherSource;
  moduleText = builtins.readFile moduleSource;

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "module evaluates without failed assertions" (failedAssertions defaults == [ ]))

    # Units and udev wiring.
    (check "mount/unmount/coldplug units are rendered when enabled" (
      defaults.systemd.services ? "korri-removable-media-mount@"
      && defaults.systemd.services ? "korri-removable-media-unmount@"
      && defaults.systemd.services ? korri-removable-media-coldplug
    ))
    (check "mmc udev rules tag mount and unmount units" (
      lib.hasInfix ''KERNEL=="mmcblk*p*"'' (udevRules defaults)
      && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-media-mount@%k.service"'' (udevRules defaults)
      && lib.hasInfix ''ENV{SYSTEMD_WANTS}+="korri-removable-media-unmount@%k.service"'' (udevRules defaults)
    ))
    (check "USB rules are omitted by default" (
      !(lib.hasInfix ''ID_BUS}=="usb"'' (udevRules defaults))
    ))
    (check "match.usb adds a USB-transport udev rule" (
      lib.hasInfix ''ID_BUS}=="usb"'' (udevRules withUsb)
      && lib.hasInfix ''KERNEL=="sd*[0-9]"'' (udevRules withUsb)
    ))
    (check "coldplug converges media present at boot" (
      builtins.elem "multi-user.target" ((coldplugUnit defaults).wantedBy or [ ])
      && lib.hasInfix "korri-removable-media-coldplug" ((coldplugUnit defaults).serviceConfig.ExecStart or "")
    ))

    # The mount prefix and signal dir are fixed cross-device contracts, not
    # per-platform preferences — card fragments reference their own content
    # by absolute path, resolved on whatever device the media is inserted
    # into.
    (check "mediaRoot and configRootsDir are read-only contracts" (
      (defaultOptions.services.korri.removableMedia.mediaRoot.readOnly or false)
      && (defaultOptions.services.korri.removableMedia.configRootsDir.readOnly or false)
    ))
    (check "a platform override of mediaRoot is rejected at eval time" (
      !(builtins.tryEval
        (evaluateWith {
          services.korri.removableMedia = {
            enable = true;
            mediaRoot = "/custom/media";
          };
        }).services.korri.removableMedia.mediaRoot
      ).success
    ))

    # Tmpfiles: media root plus the root-owned signal dir.
    (check "tmpfiles create the media root and root-owned config-roots.d" (
      builtins.elem "d /run/media/korri 0755 korri korri -" defaults.systemd.tmpfiles.rules
      && builtins.elem "d /run/korri/config-roots.d 0750 root korri -" defaults.systemd.tmpfiles.rules
    ))
    (check "contentRoot renders the stable content symlink" (
      builtins.elem "L+ /var/lib/korri/content/removable/cards - - - - /run/media/korri" withContentRoot.systemd.tmpfiles.rules
      && builtins.elem "d /var/lib/korri/content/removable 0750 korri korri -" withContentRoot.systemd.tmpfiles.rules
    ))
    (check "contentRoot is off by default" (
      !(builtins.any (rule: lib.hasInfix "content/removable" rule) defaults.systemd.tmpfiles.rules)
    ))

    # Unit env carries the matcher + script contract.
    (check "mount unit env carries the matcher contract" (
      ((mountUnit defaults).environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri"
      && ((mountUnit defaults).environment.KORRI_REMOVABLE_CONFIG_ROOTS_DIR or null) == "/run/korri/config-roots.d"
      && ((mountUnit defaults).environment.KORRI_REMOVABLE_MATCH_MMC or null) == "1"
      && ((mountUnit defaults).environment.KORRI_REMOVABLE_MATCH_USB or null) == "0"
      && ((mountUnit defaults).environment.KORRI_REMOVABLE_REQUIRED_SYSTEM_MOUNTS or null) == "/"
    ))
    (check "usb toggle reaches the matcher env" (
      ((mountUnit withUsb).environment.KORRI_REMOVABLE_MATCH_USB or null) == "1"
    ))
    (check "unmount unit shares the media/config-roots env" (
      ((unmountUnit defaults).environment.KORRI_REMOVABLE_MEDIA_ROOT or null) == "/run/media/korri"
      && ((unmountUnit defaults).environment.KORRI_REMOVABLE_CONFIG_ROOTS_DIR or null) == "/run/korri/config-roots.d"
    ))

    # Matcher gates (behavior proven by korri-removable-media-matcher; this
    # pins the contract shape so the module cannot silently swap the script).
    (check "matcher carries the positive transport gate" (
      lib.hasInfix "TRAN" matcherText && lib.hasInfix "mmcblk*p*" matcherText
    ))
    (check "matcher derives the system-disk deny-list" (
      lib.hasInfix "findmnt" matcherText
      && lib.hasInfix "PKNAME" matcherText
      && lib.hasInfix "deny_disks" matcherText
    ))
    (check "matcher is fail-safe, never fail-open" (
      lib.hasInfix "fail-safe" matcherText
      && lib.hasInfix "deny-list is empty" matcherText
      && lib.hasInfix "required system mount" matcherText
    ))
    (check "matcher guards device identity (TOCTOU)" (
      lib.hasInfix "UUID" matcherText && lib.hasInfix "identity changed" matcherText
    ))
    (check "matcher requires a safe filesystem UUID as the media id" (
      lib.hasInfix "no filesystem UUID" matcherText
      && lib.hasInfix "unsafe filesystem UUID" matcherText
    ))

    # Mount hardening + config-roots.d signal wiring (module source shape).
    (check "mounts are hardened and fs-type allowlisted" (
      lib.hasInfix "noexec,nosuid,nodev" moduleText
      && lib.hasInfix "not allowlisted" moduleText
    ))
    (check "mounts and config roots are named by the media id, not the kernel name" (
      lib.hasInfix ''mountpoint="$media_root/$media_id"'' moduleText
      && lib.hasInfix ''ln -sfn "$mountpoint" "$config_roots_dir/$media_id"'' moduleText
      && lib.hasInfix ''rm -f "$config_roots_dir/$media_id"'' moduleText
    ))
    (check "unmount resolves the mountpoint from the surviving mount table" (
      # On ACTION=remove the device node is gone; the unmount unit must find
      # the mountpoint via the mount table (findmnt --source), not derive it
      # from the kernel instance name.
      lib.hasInfix ''--source "$dev"'' moduleText
    ))
    (check "clone collisions are skipped, not aliased" (
      lib.hasInfix "already mounted from" moduleText
    ))

    # Disabled renders nothing.
    (check "enable = false renders no units, rules, or tmpfiles" (
      !(disabled.systemd.services ? "korri-removable-media-mount@")
      && !(disabled.systemd.services ? korri-removable-media-coldplug)
      && !(lib.hasInfix "korri-removable-media" (udevRules disabled))
      && !(builtins.any (rule: lib.hasInfix "config-roots.d" rule) disabled.systemd.tmpfiles.rules)
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri removable-media module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-removable-media-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri removable-media module invariants passed.
    EOF
  ''
