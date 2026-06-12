# Korri-owned guest-native ARM64 Steam adapter.
#
# The steam-korri package owns generic helper scripts and the FHS capsule. This
# module owns product policy: Korri state paths, user/session environment,
# uinput preparation, and the hardened manual launch service for SM8550 guests.
{ config, lib, pkgs, ... }:

let
  inherit (lib) mkEnableOption mkIf mkOption types;

  runtime = config.services.korri.runtime;
  cfg = config.services.korri.steam;

  defaultSteamArgs = [
    "-steamdeck"
    "-gamepadui"
    "-forcedesktopscaling"
    "1.5"
    "-noverifyfiles"
    "-nobootstrapupdate"
    "-skipinitialbootstrap"
    "-norepairfiles"
  ];

  steamUinputPrep = pkgs.writeShellScriptBin "korri-steam-ensure-uinput" ''
    set -eu

    warn() {
      echo "korri-steam-ensure-uinput: warning: $*" >&2
    }

    if [ -c /dev/uinput ]; then
      ${pkgs.coreutils}/bin/chmod 0660 /dev/uinput 2>/dev/null || true
      exit 0
    fi

    if [ -e /dev/uinput ]; then
      # A stale regular placeholder makes Steam Input's open(2) succeed but
      # uinput ioctls fail later as "Couldn't configure axes". Only replace
      # plain files/symlinks; leave unusual mounts alone and report them.
      if [ -f /dev/uinput ] || [ -L /dev/uinput ]; then
        ${pkgs.coreutils}/bin/rm -f /dev/uinput 2>/dev/null || {
          warn "could not remove stale non-character /dev/uinput"
          exit 0
        }
      else
        warn "existing /dev/uinput is not a character device; leaving it untouched"
        exit 0
      fi
    fi

    devno=""
    if [ -r /sys/devices/virtual/misc/uinput/dev ]; then
      devno="$(${pkgs.coreutils}/bin/cat /sys/devices/virtual/misc/uinput/dev 2>/dev/null || true)"
    fi
    if [ -z "$devno" ] && [ -r /proc/misc ]; then
      minor="$(${pkgs.gawk}/bin/awk '$2 == "uinput" { print $1; exit }' /proc/misc 2>/dev/null || true)"
      if [ -n "$minor" ]; then
        # uinput is a Linux misc device; misc devices use dynamic major 10.
        devno="10:$minor"
      fi
    fi

    case "$devno" in
      [0-9]*:[0-9]*) ;;
      *)
        warn "kernel did not report a uinput device number"
        exit 0
        ;;
    esac

    major="''${devno%:*}"
    minor="''${devno#*:}"
    case "$major:$minor" in
      *[!0-9:]*|:*|*:)
        warn "invalid uinput device number: $devno"
        exit 0
        ;;
    esac

    ${pkgs.coreutils}/bin/mknod /dev/uinput c "$major" "$minor" 2>/dev/null || {
      warn "could not create /dev/uinput c $major:$minor"
      exit 0
    }
    ${pkgs.coreutils}/bin/chmod 0660 /dev/uinput 2>/dev/null || true
  '';

  fexRootfsPreparer = pkgs.writeShellScriptBin "korri-steam-prepare-fex-rootfs" ''
    set -eu

    steam_home=${lib.escapeShellArg cfg.home}
    fex_rootfs=${lib.escapeShellArg cfg.fexRootfs}
    rootfs_dir="$steam_home/fex-data/RootFS/ArchLinux"
    sqsh="$steam_home/fex-data/RootFS/ArchLinux.sqsh"
    url="https://rootfs.fex-emu.gg/ArchLinux/2026-01-08/ArchLinux.sqsh"
    fex_config_dir=${lib.escapeShellArg cfg.fexConfigDir}
    fex_config_source=${lib.escapeShellArg "${cfg.package}/share/steam-rocknix-bootstrap/resources/fex-emu"}
    fex_share=${lib.escapeShellArg "${pkgs.fex}/share/fex-emu"}

    ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$fex_config_dir" "$fex_config_dir/AppConfig"
    if [ -f "$fex_config_source/Config.json" ] && [ ! -f "$fex_config_dir/Config.json" ]; then
      ${pkgs.coreutils}/bin/install -o ${runtime.user} -g ${runtime.group} -m 0640 "$fex_config_source/Config.json" "$fex_config_dir/Config.json"
    fi
    if [ -f "$fex_config_source/AppConfig/steamwebhelper.json" ] && [ ! -f "$fex_config_dir/AppConfig/steamwebhelper.json" ]; then
      ${pkgs.coreutils}/bin/install -o ${runtime.user} -g ${runtime.group} -m 0640 "$fex_config_source/AppConfig/steamwebhelper.json" "$fex_config_dir/AppConfig/steamwebhelper.json"
    fi

    prepare_proton_fex_share() {
      local proton_dir target
      for proton_dir in "$steam_home"/steamapps/common/Proton*; do
        [ -d "$proton_dir/files/share" ] || continue
        target="$proton_dir/files/share/fex-emu"
        if [ -e "$target" ] && [ ! -L "$target" ]; then
          ${pkgs.coreutils}/bin/mv -f "$target" "$target.pre-korri-fex-share"
        fi
        ln -sfn "$fex_share" "$target"
        ${pkgs.coreutils}/bin/chown -h ${runtime.user}:${runtime.group} "$target"
      done
    }

    ensure_rootfs_squashfs() {
      ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$steam_home/fex-data/RootFS"
      if [ ! -s "$sqsh" ]; then
        tmp="$sqsh.tmp"
        rm -f "$tmp"
        ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.curl}/bin/curl \
          -fL --retry 5 --retry-delay 2 --connect-timeout 30 --max-time 3600 \
          -o "$tmp" "$url"
        ${pkgs.coreutils}/bin/mv -f "$tmp" "$sqsh"
        ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$sqsh"
      fi
    }

    repair_freedreno_arch() {
      local target_root="$1" lib machine tmp
      lib="$target_root/usr/lib/libvulkan_freedreno.so"
      [ -f "$lib" ] || return 0
      machine="$(${pkgs.coreutils}/bin/od -An -tx1 -j18 -N2 "$lib" 2>/dev/null || true)"
      case "$machine" in
        *"3e 00"*) return 0 ;;
      esac

      if [ ! -s "$sqsh" ]; then
        echo "korri-steam-prepare-fex-rootfs: cannot repair $lib without $sqsh" >&2
        return 1
      fi

      echo "korri-steam-prepare-fex-rootfs: restoring x86_64 Freedreno ICD from $sqsh" >&2
      tmp="$steam_home/fex-data/RootFS/.restore-freedreno.$$"
      rm -rf "$tmp"
      ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$tmp"
      ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.squashfsTools}/bin/unsquashfs -q -f -d "$tmp" "$sqsh" \
        usr/lib/libvulkan_freedreno.so usr/lib32/libvulkan_freedreno.so
      if [ -f "$tmp/squashfs-root/usr/lib/libvulkan_freedreno.so" ]; then
        if [ ! -e "$lib.pre-korri-wrong-arch" ]; then
          ${pkgs.coreutils}/bin/cp -a "$lib" "$lib.pre-korri-wrong-arch"
        fi
        ${pkgs.coreutils}/bin/cp -a "$tmp/squashfs-root/usr/lib/libvulkan_freedreno.so" "$lib"
        ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$lib"
      fi
      if [ -f "$tmp/squashfs-root/usr/lib32/libvulkan_freedreno.so" ]; then
        ${pkgs.coreutils}/bin/cp -a "$tmp/squashfs-root/usr/lib32/libvulkan_freedreno.so" "$target_root/usr/lib32/libvulkan_freedreno.so"
        ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$target_root/usr/lib32/libvulkan_freedreno.so"
      fi
      rm -rf "$tmp"
    }

    ensure_rootfs_squashfs
    prepare_proton_fex_share

    if [ -e "$fex_rootfs/usr/bin" ] || [ -e "$fex_rootfs/etc/os-release" ]; then
      repair_freedreno_arch "$fex_rootfs"
      exit 0
    fi

    # tmpfiles may have created fexRootfs as an empty directory. Replace only an
    # empty directory; never delete a populated custom rootfs.
    if [ -d "$fex_rootfs" ] && [ ! -e "$fex_rootfs/etc/os-release" ]; then
      rmdir "$fex_rootfs" 2>/dev/null || {
        echo "korri-steam-prepare-fex-rootfs: refusing to replace non-empty $fex_rootfs" >&2
        exit 1
      }
    fi

    if [ ! -e "$rootfs_dir/etc/os-release" ]; then
      rm -rf "$rootfs_dir.tmp"
      ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$rootfs_dir.tmp"
      ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.squashfsTools}/bin/unsquashfs -f -d "$rootfs_dir.tmp" "$sqsh"
      rm -rf "$rootfs_dir"
      ${pkgs.coreutils}/bin/mv "$rootfs_dir.tmp" "$rootfs_dir"
      ${pkgs.coreutils}/bin/chown -R ${runtime.user}:${runtime.group} "$rootfs_dir"
    fi

    ln -sfn "$rootfs_dir" "$fex_rootfs"
    ${pkgs.coreutils}/bin/chown -h ${runtime.user}:${runtime.group} "$fex_rootfs"
    repair_freedreno_arch "$rootfs_dir"
  '';

  steamLauncher = pkgs.writeShellScriptBin "korri-steam-guest" ''
    set -e

    export HOME="''${HOME:-${runtime.home}}"
    export USER="''${USER:-${runtime.user}}"
    export XDG_RUNTIME_DIR="''${XDG_RUNTIME_DIR:-/run/user/${toString runtime.uid}}"
    export WAYLAND_DISPLAY="''${WAYLAND_DISPLAY:-wayland-1}"
    export DISPLAY="''${DISPLAY:-:0}"
    export DBUS_SESSION_BUS_ADDRESS="''${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/${toString runtime.uid}/bus}"
    export LANG="''${LANG:-C.UTF-8}"
    if [ -z "''${STEAM_HOME:-}" ]; then export STEAM_HOME=${lib.escapeShellArg cfg.home}; fi
    if [ -z "''${STEAM_GAMES_ROOT:-}" ]; then export STEAM_GAMES_ROOT=${lib.escapeShellArg cfg.gamesRoot}; fi
    if [ -z "''${STEAM_DOT:-}" ]; then export STEAM_DOT=${lib.escapeShellArg cfg.dotDir}; fi
    if [ -z "''${FEX_ROOTFS:-}" ]; then export FEX_ROOTFS=${lib.escapeShellArg cfg.fexRootfs}; fi

    export SDL_JOYSTICK_DISABLE_UDEV="''${SDL_JOYSTICK_DISABLE_UDEV:-1}"
    export GTK_IM_MODULE="''${GTK_IM_MODULE:-xim}"
    unset GIO_EXTRA_MODULES

    export LIBGL_DRIVERS_PATH="''${LIBGL_DRIVERS_PATH:-/run/opengl-driver/lib/dri}"
    export __EGL_VENDOR_LIBRARY_DIRS="''${__EGL_VENDOR_LIBRARY_DIRS:-/run/opengl-driver/share/glvnd/egl_vendor.d}"
    export LIBVA_DRIVERS_PATH="''${LIBVA_DRIVERS_PATH:-/run/opengl-driver/lib/dri}"
    export VDPAU_DRIVER_PATH="''${VDPAU_DRIVER_PATH:-/run/opengl-driver/lib/vdpau}"

    ${steamUinputPrep}/bin/korri-steam-ensure-uinput || true

    if [ "$#" -eq 0 ]; then
      set -- ${lib.escapeShellArgs cfg.defaultArgs}
    fi

    # buildFHSEnv/bwrap tries to enter the caller's cwd. A root shell or other
    # unreadable cwd fails before steam-guest-run can cd, so move into Steam's
    # Korri-owned state dir before entering the capsule.
    cd "$STEAM_HOME"
    exec ${cfg.package}/bin/steam-arm64-fhs "$@"
  '';
in
{
  key = "korri-steam";

  options.services.korri.steam = {
    enable = mkEnableOption "Korri guest-native ARM64 Steam adapter";

    package = mkOption {
      type = types.package;
      default = pkgs.steam-korri;
      defaultText = lib.literalExpression "pkgs.steam-korri";
      description = "Package-owned Steam runtime capsule consumed by the Korri guest adapter.";
    };

    home = mkOption {
      type = types.str;
      default = "${runtime.stateRoot}/steam";
      defaultText = lib.literalExpression ''"${config.services.korri.runtime.stateRoot}/steam"'';
      description = "Mutable guest Steam home supplied to package-owned helpers.";
    };

    gamesRoot = mkOption {
      type = types.str;
      default = "${runtime.gamesRoot}/steam";
      defaultText = lib.literalExpression ''"${config.services.korri.runtime.gamesRoot}/steam"'';
      description = "Mutable guest Steam library root supplied to package-owned helpers.";
    };

    dotDir = mkOption {
      type = types.str;
      default = "${runtime.home}/.steam";
      defaultText = lib.literalExpression ''"${config.services.korri.runtime.home}/.steam"'';
      description = "Mutable guest Steam dot-directory used by bootstrap and seed helpers.";
    };

    fexRootfs = mkOption {
      type = types.str;
      default = "${runtime.stateRoot}/steam/fex-rootfs";
      defaultText = lib.literalExpression ''"${config.services.korri.runtime.stateRoot}/steam/fex-rootfs"'';
      description = "Guest-provided FEX rootfs path for x86 Steam Runtime helpers and games.";
    };

    fexConfigDir = mkOption {
      type = types.str;
      default = "${runtime.home}/.config/fex-emu";
      defaultText = lib.literalExpression ''"${config.services.korri.runtime.home}/.config/fex-emu"'';
      description = "FEX config directory seeded from ROCKNIX's working Steam/FEX template.";
    };

    defaultArgs = mkOption {
      type = types.listOf types.str;
      default = defaultSteamArgs;
      description = "Default Steam client arguments supplied by the Korri guest adapter.";
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = pkgs.stdenv.hostPlatform.system == "aarch64-linux";
        message = "services.korri.steam requires the aarch64 Steam run capsule; x86 package support is helper/check-only.";
      }
      {
        assertion = cfg.package ? rocknixSteamHasRunCapsule && cfg.package.rocknixSteamHasRunCapsule;
        message = "services.korri.steam.package must provide the aarch64 Steam run capsule; helper-only x86 packages cannot satisfy the guest launcher.";
      }
      {
        assertion = lib.hasPrefix runtime.stateRoot cfg.home;
        message = "services.korri.steam.home must live under services.korri.runtime.stateRoot.";
      }
      {
        assertion = lib.hasPrefix runtime.gamesRoot cfg.gamesRoot;
        message = "services.korri.steam.gamesRoot must live under services.korri.runtime.gamesRoot.";
      }
      {
        assertion = lib.hasPrefix runtime.home cfg.dotDir;
        message = "services.korri.steam.dotDir must live under services.korri.runtime.home.";
      }
      {
        assertion = lib.hasPrefix cfg.home cfg.fexRootfs;
        message = "services.korri.steam.fexRootfs must live under services.korri.steam.home.";
      }
      {
        assertion = lib.hasPrefix runtime.home cfg.fexConfigDir;
        message = "services.korri.steam.fexConfigDir must live under services.korri.runtime.home.";
      }
    ];

    environment.systemPackages = [
      cfg.package
      steamLauncher
      steamUinputPrep
      fexRootfsPreparer
    ];

    systemd.tmpfiles.rules = [
      "d ${cfg.home} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.gamesRoot} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.dotDir} 0700 ${runtime.user} ${runtime.group} -"
      "d ${cfg.fexConfigDir} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.fexConfigDir}/AppConfig 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.home}/fex-data/RootFS 0750 ${runtime.user} ${runtime.group} -"
    ];

    systemd.services.korri-steam-uinput = {
      description = "Prepare the guest uinput device for Steam Input";
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${steamUinputPrep}/bin/korri-steam-ensure-uinput";
        RemainAfterExit = true;
      };
    };

    systemd.services.korri-steam-prepare-fex-rootfs = {
      description = "Prepare the Korri Steam FEX rootfs";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${fexRootfsPreparer}/bin/korri-steam-prepare-fex-rootfs";
        RemainAfterExit = true;
        TimeoutStartSec = "infinity";
      };
    };

    systemd.services.korri-steam = {
      description = "Launch Korri guest-native Steam";
      after = [ "korri-steam-uinput.service" "korri-steam-prepare-fex-rootfs.service" ];
      wants = [ "korri-steam-uinput.service" "korri-steam-prepare-fex-rootfs.service" ];
      environment = {
        HOME = runtime.home;
        USER = runtime.user;
        XDG_RUNTIME_DIR = "/run/user/${toString runtime.uid}";
        WAYLAND_DISPLAY = "wayland-1";
        DISPLAY = ":0";
        DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/${toString runtime.uid}/bus";
        STEAM_HOME = cfg.home;
        STEAM_GAMES_ROOT = cfg.gamesRoot;
        STEAM_DOT = cfg.dotDir;
        FEX_ROOTFS = cfg.fexRootfs;
      };
      serviceConfig = {
        Type = "simple";
        User = runtime.user;
        Group = runtime.group;
        WorkingDirectory = cfg.home;
        LimitNOFILE = 524288;
        ExecStart = "${steamLauncher}/bin/korri-steam-guest";
      };
    };
  };
}
