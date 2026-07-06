# Korri-owned guest-native ARM64 Steam adapter.
#
# The steam-korri package owns generic helper scripts and the FHS capsule. This
# module owns product policy: Korri state paths, user/session environment,
# uinput preparation, and the hardened manual launch service for SM8550 guests.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    types
    ;

  runtime = config.services.korri.runtime;
  cfg = config.services.korri.steam;
  korriPulseServer = "unix:/run/user/${toString runtime.uid}/pulse/native";
  steamInputGroup = "korri-steam-input";
  steamMaterializerProbePath = [
    pkgs.coreutils
    pkgs.procps
    pkgs.systemd
  ];

  defaultSteamArgs = [
    # Keep Steam out of Deck/Gamepad UI persona by default. -gamepadui,
    # -steamdeck, -steampal, and -steamos3 all push the client toward
    # Big Picture / SteamOS behavior; on SM8550 that can retain controller
    # ownership after focus changes or assume platform Bluetooth policy.
    # Visibility is a session/debug concern, not a Steam startup flag.
    # Do not include bootstrap/update suppressors here: Valve-owned ARM64
    # client metadata must be allowed to self-update/install pending manifests.
    "-nobigpicture"
    "-nochatui"
    "-nofriendsui"
    "-forcedesktopscaling"
    "1.5"
  ];
  gamescopeArgs = lib.escapeShellArgs (
    [
      "-f"
      "-W"
      "1920"
      "-H"
      "1080"
    ]
    ++ lib.optionals (cfg.gamescopePreferOutput != null) [
      "-O"
      cfg.gamescopePreferOutput
    ]
  );
  steamClientArgs = lib.escapeShellArgs (
    [
      "-clientbeta"
      cfg.betaChannel
    ]
    ++ (lib.optional cfg.useGamepadUi "-gamepadui")
    ++ cfg.defaultArgs
  );
  steamServiceExec =
    if cfg.presentationMode == "gamescope" then
      # Keep Steam contained in Gamescope, but hide Gamescope's SteamOS/Gamepad
      # UI hints from the Steam client. Steam can still render through the
      # Gamescope-owned Xwayland DISPLAY, but it should not see Gamescope's
      # Wayland/libei integration path that pushes native ARM64 Steam toward
      # gamepadui.
      "${pkgs.gamescope}/bin/gamescope ${gamescopeArgs} -- ${pkgs.coreutils}/bin/env -u GAMESCOPE_WAYLAND_DISPLAY -u LIBEI_SOCKET -u STEAM_GAME_DISPLAY_0 -u ENABLE_GAMESCOPE_WSI -u WAYLAND_DISPLAY XDG_CURRENT_DESKTOP=sway ${steamLauncher}/bin/korri-steam-guest ${steamClientArgs}"
    else
      "${steamLauncher}/bin/korri-steam-guest ${steamClientArgs}";

  steamServiceRunner = pkgs.writeShellScriptBin "korri-steam-service-run" ''
    set -u

    guard_status=77

    is_descendant_of() {
      child="$1"
      ancestor="$2"
      while [ -n "$child" ] && [ "$child" != "1" ]; do
        [ "$child" = "$ancestor" ] && return 0
        [ -r "/proc/$child/status" ] || return 1
        child="$(${pkgs.gawk}/bin/awk '/^PPid:/ { print $2; exit }' "/proc/$child/status" 2>/dev/null || true)"
      done
      return 1
    }

    stop_gamescope() {
      pid="$1"
      [ -n "$pid" ] || return 0
      kill "$pid" 2>/dev/null || return 0
      for _ in $(${pkgs.coreutils}/bin/seq 1 20); do
        kill -0 "$pid" 2>/dev/null || return 0
        ${pkgs.coreutils}/bin/sleep 0.25
      done
      kill -KILL "$pid" 2>/dev/null || true
    }

    steam_workspace="''${KORRI_STEAM_WORKSPACE:-korri:steam-debug}"
    sway_sock="/run/user/${toString runtime.uid}/sway-ipc.sock"
    place_gamescope_workspace() {
      pid="$1"
      [ -S "$sway_sock" ] || return 1
      SWAYSOCK="$sway_sock" ${pkgs.sway}/bin/swaymsg \
        "[pid=$pid] move container to workspace \"$steam_workspace\", fullscreen enable, border none" \
        >/dev/null 2>&1
    }

    ${steamServiceExec} &
    gamescope_pid="$!"

    trap 'stop_gamescope "$gamescope_pid"; wait "$gamescope_pid" 2>/dev/null; exit 143' TERM INT

    accepted_ui_pid=""
    workspace_placed=0
    while true; do
      if ! kill -0 "$gamescope_pid" 2>/dev/null; then
        wait "$gamescope_pid"
        exit "$?"
      fi

      if [ "$workspace_placed" -eq 0 ] && place_gamescope_workspace "$gamescope_pid"; then
        echo "korri-steam-service-run: moved managed Gamescope pid=$gamescope_pid to workspace $steam_workspace" >&2
        workspace_placed=1
      fi

      for cmdline in /proc/[0-9]*/cmdline; do
        [ -r "$cmdline" ] || continue
        pid="''${cmdline#/proc/}"
        pid="''${pid%/cmdline}"
        is_descendant_of "$pid" "$gamescope_pid" || continue
        cmd="$(${pkgs.coreutils}/bin/tr '\0' ' ' < "$cmdline" 2>/dev/null || true)"
        case "$cmd" in
          *steamwebhelper*" -uimode=4"*)
            echo "korri-steam-service-run: refusing Steam Gamepad UI descendant pid=$pid; stopping managed Gamescope pid=$gamescope_pid" >&2
            stop_gamescope "$gamescope_pid"
            wait "$gamescope_pid" 2>/dev/null || true
            exit "$guard_status"
            ;;
          *steamwebhelper*" -uimode="*)
            if [ "$accepted_ui_pid" != "$pid" ]; then
              echo "korri-steam-service-run: Steam UI guard accepted descendant pid=$pid: $cmd" >&2
              accepted_ui_pid="$pid"
            fi
            ;;
        esac
      done

      ${pkgs.coreutils}/bin/sleep 1
    done
  '';

  steamUinputPrep = pkgs.writeShellScriptBin "korri-steam-ensure-uinput" ''
    set -eu

    warn() {
      echo "korri-steam-ensure-uinput: warning: $*" >&2
    }

    make_accessible() {
      ${pkgs.coreutils}/bin/chgrp ${steamInputGroup} /dev/uinput 2>/dev/null || true
      ${pkgs.coreutils}/bin/chmod 0660 /dev/uinput 2>/dev/null || true
      ${pkgs.acl}/bin/setfacl -b /dev/uinput 2>/dev/null || true
    }

    if [ -c /dev/uinput ]; then
      make_accessible
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
    make_accessible
  '';

  fexRootfsPreparer = pkgs.writeShellScriptBin "korri-steam-prepare-fex-rootfs" ''
    set -eu

    steam_home=${lib.escapeShellArg cfg.home}
    fex_rootfs=${lib.escapeShellArg cfg.fexRootfs}
    rootfs_base_dir="$steam_home/fex-data/RootFS/ArchLinux"
    rootfs_dir="$steam_home/fex-data/RootFS/ArchLinux-mesa26"
    sqsh="$steam_home/fex-data/RootFS/ArchLinux.sqsh"
    url="https://rootfs.fex-emu.gg/ArchLinux/2026-01-08/ArchLinux.sqsh"
    mesa_overlay_dir="$steam_home/fex-data/mesa26-overlay"
    mesa_overlay_version="1:26.1.2-1"
    mesa_overlay_marker=".korri-mesa26-freedreno-overlay"
    fex_config_dir=${lib.escapeShellArg cfg.fexConfigDir}
    fex_config_source=${lib.escapeShellArg "${cfg.package}/share/steam-rocknix-bootstrap/resources/fex-emu"}
    fex_share=${lib.escapeShellArg "${pkgs.fex}/share/fex-emu"}

    ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 \
      "$steam_home" \
      "$steam_home/fex-data" \
      "$steam_home/fex-data/RootFS" \
      "$mesa_overlay_dir" \
      "$fex_config_dir" \
      "$fex_config_dir/AppConfig"
    if [ -f "$fex_config_source/Config.json" ] && [ ! -f "$fex_config_dir/Config.json" ]; then
      ${pkgs.coreutils}/bin/install -o ${runtime.user} -g ${runtime.group} -m 0640 "$fex_config_source/Config.json" "$fex_config_dir/Config.json"
    fi
    if [ -f "$fex_config_source/AppConfig/steamwebhelper.json" ] && [ ! -f "$fex_config_dir/AppConfig/steamwebhelper.json" ]; then
      ${pkgs.coreutils}/bin/install -o ${runtime.user} -g ${runtime.group} -m 0640 "$fex_config_source/AppConfig/steamwebhelper.json" "$fex_config_dir/AppConfig/steamwebhelper.json"
    fi

    # Do not patch Steam-managed Proton trees here. Steam owns mutable
    # steamapps/common/Proton* content; Korri-owned compatibility-tool metadata
    # is seeded by steam-arm64-seed/bootstrap and VDF state is materialized by
    # the Steam plugin.

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

    ensure_base_rootfs() {
      if [ -e "$rootfs_base_dir/etc/os-release" ]; then
        return 0
      fi

      rm -rf "$rootfs_base_dir.tmp"
      ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$rootfs_base_dir.tmp"
      ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.squashfsTools}/bin/unsquashfs -f -d "$rootfs_base_dir.tmp" "$sqsh"
      rm -rf "$rootfs_base_dir"
      ${pkgs.coreutils}/bin/mv "$rootfs_base_dir.tmp" "$rootfs_base_dir"
      ${pkgs.coreutils}/bin/chown -R ${runtime.user}:${runtime.group} "$rootfs_base_dir"
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

    mesa26_packages() {
      printf '%s\n' \
        'be9cdb7a2a1c4eb096f57328c955b018950946edfdbb7f04ef697d4999e5a808  mesa-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/m/mesa/mesa-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        'a32b6c7f956ac6ddff53126d9717643d6edf5215d4279b7a84f72a5908a42c71  lib32-mesa-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/lib32-mesa/lib32-mesa-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        '7db14d6e8e6926b31de09716dfd03451c22e348da8b1ea35f5438fbb9a618dee  vulkan-freedreno-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/v/vulkan-freedreno/vulkan-freedreno-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        '98793dac11cefb40b43f4e9007d0c183b523dbf6c340020d4102b41228958a6f  lib32-vulkan-freedreno-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/lib32-vulkan-freedreno/lib32-vulkan-freedreno-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        'e708f001c78a220e87eeaf42df022664df6ced4963bf61d4a22528d21fe61292  vulkan-mesa-implicit-layers-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/v/vulkan-mesa-implicit-layers/vulkan-mesa-implicit-layers-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        'a9e2ca9c2df8fa5897d3baeadb298cd2969a229539119c05ff436550246915b7  lib32-vulkan-mesa-implicit-layers-1:26.1.2-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/lib32-vulkan-mesa-implicit-layers/lib32-vulkan-mesa-implicit-layers-1%3A26.1.2-1-x86_64.pkg.tar.zst' \
        '07ab1479ec5e70aea174e2d0e340bd9364b507ed74f2df3bfd51b3c6f40e5787  libdisplay-info-0.3.0-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/libdisplay-info/libdisplay-info-0.3.0-1-x86_64.pkg.tar.zst' \
        '5ffcb2f1e599529014beaadff257ee805ecdf3991948e33ebf398e202ce135f0  lib32-libdisplay-info-0.3.0-1-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/lib32-libdisplay-info/lib32-libdisplay-info-0.3.0-1-x86_64.pkg.tar.zst' \
        '312213911881c0742e2a825432feac761e863945b74bb3a6daca97a99778d35e  xcb-util-keysyms-0.4.1-5-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/x/xcb-util-keysyms/xcb-util-keysyms-0.4.1-5-x86_64.pkg.tar.zst' \
        '62940da026cc3ca714d6989a542edfe3aaf7ec8b5c148fc9007e2e3b9ec3f5a6  lib32-xcb-util-keysyms-0.4.1-2-x86_64.pkg.tar.zst  https://archive.archlinux.org/packages/l/lib32-xcb-util-keysyms/lib32-xcb-util-keysyms-0.4.1-2-x86_64.pkg.tar.zst'
    }

    fetch_mesa26_packages() {
      local hash filename url dest tmp
      mesa26_packages | while read -r hash filename url; do
        [ -n "$hash" ] || continue
        dest="$mesa_overlay_dir/$filename"
        if [ ! -s "$dest" ] || ! printf '%s  %s\n' "$hash" "$dest" | ${pkgs.coreutils}/bin/sha256sum -c - >/dev/null 2>&1; then
          tmp="$dest.tmp"
          rm -f "$tmp"
          ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.curl}/bin/curl \
            -fL --retry 5 --retry-delay 2 --connect-timeout 30 --max-time 1200 \
            -o "$tmp" "$url"
          printf '%s  %s\n' "$hash" "$tmp" | ${pkgs.coreutils}/bin/sha256sum -c - >/dev/null
          ${pkgs.coreutils}/bin/mv -f "$tmp" "$dest"
          ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$dest"
        fi
      done
    }

    extract_arch_package() {
      local target_root="$1" filename="$2" pkg="$mesa_overlay_dir/$filename"
      ${pkgs.sudo}/bin/sudo -u ${runtime.user} ${pkgs.gnutar}/bin/tar \
        --use-compress-program=${pkgs.zstd}/bin/zstd \
        --no-same-owner \
        --exclude='.BUILDINFO' \
        --exclude='.CHANGELOG' \
        --exclude='.INSTALL' \
        --exclude='.MTREE' \
        --exclude='.PKGINFO' \
        -xpf "$pkg" -C "$target_root"
    }

    verify_mesa26_overlay() {
      local target_root="$1" machine64 machine32
      [ -f "$target_root/usr/lib/libgallium-26.1.2-arch1.1.so" ] || return 1
      [ -f "$target_root/usr/lib32/libgallium-26.1.2-arch1.1.so" ] || return 1
      [ -f "$target_root/usr/share/vulkan/icd.d/freedreno_icd.x86_64.json" ] || return 1
      [ -f "$target_root/usr/share/vulkan/icd.d/freedreno_icd.i686.json" ] || return 1
      [ -f "$target_root/usr/lib/libdisplay-info.so.3" ] || return 1
      [ -f "$target_root/usr/lib32/libdisplay-info.so.3" ] || return 1
      [ -f "$target_root/usr/lib/libxcb-keysyms.so.1" ] || return 1
      [ -f "$target_root/usr/lib32/libxcb-keysyms.so.1" ] || return 1
      machine64="$(${pkgs.coreutils}/bin/od -An -tx1 -j18 -N2 "$target_root/usr/lib/libvulkan_freedreno.so" 2>/dev/null || true)"
      machine32="$(${pkgs.coreutils}/bin/od -An -tx1 -j18 -N2 "$target_root/usr/lib32/libvulkan_freedreno.so" 2>/dev/null || true)"
      case "$machine64" in *"3e 00"*) ;; *) return 1 ;; esac
      case "$machine32" in *"03 00"*) ;; *) return 1 ;; esac
    }

    apply_mesa26_overlay() {
      local target_root="$1" hash filename url
      if [ -f "$target_root/$mesa_overlay_marker" ] \
        && grep -q "mesa-freedreno=$mesa_overlay_version" "$target_root/$mesa_overlay_marker" \
        && verify_mesa26_overlay "$target_root"; then
        return 0
      fi

      echo "korri-steam-prepare-fex-rootfs: applying pinned Mesa/Freedreno $mesa_overlay_version overlay" >&2
      fetch_mesa26_packages
      mesa26_packages | while read -r hash filename url; do
        [ -n "$filename" ] || continue
        extract_arch_package "$target_root" "$filename"
      done
      verify_mesa26_overlay "$target_root"
      printf '%s\n' \
        "mesa-freedreno=$mesa_overlay_version" \
        "source=archlinux-archive" \
        "validated=30XX-and-Stray-sm8550-proton10-fex" \
        > "$target_root/$mesa_overlay_marker"
      ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$target_root/$mesa_overlay_marker"
    }

    ensure_mesa26_rootfs() {
      local tmp old
      if [ -e "$rootfs_dir/etc/os-release" ] && apply_mesa26_overlay "$rootfs_dir"; then
        return 0
      fi

      ensure_base_rootfs
      tmp="$rootfs_dir.tmp"
      old="$rootfs_dir.previous"
      rm -rf "$tmp"
      ${pkgs.coreutils}/bin/cp -a "$rootfs_base_dir" "$tmp"
      ${pkgs.coreutils}/bin/chown -R ${runtime.user}:${runtime.group} "$tmp"
      repair_freedreno_arch "$tmp"
      apply_mesa26_overlay "$tmp"
      rm -rf "$old"
      if [ -e "$rootfs_dir" ]; then
        ${pkgs.coreutils}/bin/mv "$rootfs_dir" "$old"
      fi
      ${pkgs.coreutils}/bin/mv "$tmp" "$rootfs_dir"
      ${pkgs.coreutils}/bin/chown -R ${runtime.user}:${runtime.group} "$rootfs_dir"
    }

    ensure_rootfs_squashfs
    ensure_mesa26_rootfs

    if [ -d "$fex_rootfs" ] && [ ! -L "$fex_rootfs" ]; then
      rmdir "$fex_rootfs" 2>/dev/null || {
        echo "korri-steam-prepare-fex-rootfs: refusing to replace non-empty non-symlink $fex_rootfs" >&2
        exit 1
      }
    fi

    ln -sfn "$rootfs_dir" "$fex_rootfs"
    ${pkgs.coreutils}/bin/chown -h ${runtime.user}:${runtime.group} "$fex_rootfs"
  '';

  steamLauncher = pkgs.writeShellScriptBin "korri-steam-guest" ''
    set -e

    export HOME="''${HOME:-${runtime.home}}"
    export USER="''${USER:-${runtime.user}}"
    export XDG_RUNTIME_DIR="''${XDG_RUNTIME_DIR:-/run/user/${toString runtime.uid}}"
    export WAYLAND_DISPLAY="''${WAYLAND_DISPLAY:-wayland-1}"
    export DISPLAY="''${DISPLAY:-:0}"
    export DBUS_SESSION_BUS_ADDRESS="''${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/${toString runtime.uid}/bus}"
    export PULSE_SERVER="''${PULSE_SERVER:-${korriPulseServer}}"
    export LANG="''${LANG:-C.UTF-8}"
    if [ -z "''${STEAM_HOME:-}" ]; then export STEAM_HOME=${lib.escapeShellArg cfg.home}; fi
    if [ -z "''${STEAM_GAMES_ROOT:-}" ]; then export STEAM_GAMES_ROOT=${lib.escapeShellArg cfg.gamesRoot}; fi
    if [ -z "''${STEAM_DOT:-}" ]; then export STEAM_DOT=${lib.escapeShellArg cfg.dotDir}; fi
    if [ -z "''${STEAM_BETA:-}" ]; then export STEAM_BETA=${lib.escapeShellArg cfg.betaChannel}; fi
    if [ -z "''${FEX_ROOTFS:-}" ]; then export FEX_ROOTFS=${lib.escapeShellArg cfg.fexRootfs}; fi

    export SDL_JOYSTICK_DISABLE_UDEV="''${SDL_JOYSTICK_DISABLE_UDEV:-1}"
    export GTK_IM_MODULE="''${GTK_IM_MODULE:-xim}"
    unset GIO_EXTRA_MODULES

    export LIBGL_DRIVERS_PATH="''${LIBGL_DRIVERS_PATH:-/run/opengl-driver/lib/dri}"
    export __EGL_VENDOR_LIBRARY_DIRS="''${__EGL_VENDOR_LIBRARY_DIRS:-/run/opengl-driver/share/glvnd/egl_vendor.d}"
    export LIBVA_DRIVERS_PATH="''${LIBVA_DRIVERS_PATH:-/run/opengl-driver/lib/dri}"
    export VDPAU_DRIVER_PATH="''${VDPAU_DRIVER_PATH:-/run/opengl-driver/lib/vdpau}"

    ${steamUinputPrep}/bin/korri-steam-ensure-uinput || true

    repair_arm64_client_manifest() {
      package_dir="$STEAM_HOME/package"
      installed_file="$package_dir/steam_client_''${STEAM_BETA}_linuxarm64.installed"
      manifest_file="$package_dir/steam_client_''${STEAM_BETA}_linuxarm64.manifest"
      beta_tmp="$package_dir/beta.tmp.$$"
      manifest_tmp="$manifest_file.tmp.$$"
      downloaded_manifest="$package_dir/steam_client_''${STEAM_BETA}_linuxarm64.downloaded.$$"
      client_version=""

      mkdir -p "$package_dir"
      printf '%s\n' "$STEAM_BETA" > "$beta_tmp"
      mv -f "$beta_tmp" "$package_dir/beta"

      if [ -f "$installed_file" ]; then
        client_version=$(${pkgs.gawk}/bin/awk -F'[,;]' 'NR == 1 && $3 ~ /^[0-9]+$/ { print $3; exit }' "$installed_file" 2>/dev/null || true)
      fi
      if [ -z "$client_version" ]; then
        fallback_manifest="$package_dir/steam_client_''${STEAM_BETA}_ubuntu12.manifest"
        if [ -f "$fallback_manifest" ]; then
          client_version=$(${pkgs.gawk}/bin/awk -F'\"' '/\"version\"/ { print $4; exit }' "$fallback_manifest" 2>/dev/null || true)
        fi
      fi

      if [ -n "$client_version" ]; then
        if ${pkgs.curl}/bin/curl -fsSL --connect-timeout 10 --max-time 30 \
          "https://client-update.fastly.steamstatic.com/steam_client_''${STEAM_BETA}_linuxarm64" \
          -o "$downloaded_manifest" 2>/dev/null; then
          ${pkgs.gawk}/bin/awk -v version="$client_version" '
            BEGIN { replaced = 0 }
            !replaced && $1 == "\"version\"" {
              print "\t\"version\"\t\t\"" version "\""
              replaced = 1
              next
            }
            { print }
          ' "$downloaded_manifest" > "$manifest_tmp"
          rm -f "$downloaded_manifest"
        else
          rm -f "$downloaded_manifest"
          cat > "$manifest_tmp" <<EOF
"linuxarm64"
{
	"version"		"$client_version"
}
EOF
        fi
        mv -f "$manifest_tmp" "$manifest_file"
      else
        rm -f "$manifest_tmp" "$downloaded_manifest"
        echo "korri-steam-guest: no ARM64 client version found; manifest repair skipped" >&2
      fi
    }

    repair_arm64_client_manifest

    if [ "$#" -eq 0 ]; then
      set -- ${lib.escapeShellArgs cfg.defaultArgs}
    fi

    # Keep managed Steam self-updating. These suppressors are useful for one-off
    # manual debugging, but in the managed service they can leave Valve-owned
    # ARM64 package metadata half-updated: Steam sees a pending channel manifest,
    # cannot install it, drops back to the generic linuxarm64 channel, and loops
    # on the non-existent steam_client_linuxarm64 endpoint.
    filtered=()
    for arg in "$@"; do
      case "$arg" in
        -noverifyfiles|-nobootstrapupdate|-skipinitialbootstrap|-norepairfiles) ;;
        *) filtered+=("$arg") ;;
      esac
    done
    set -- "''${filtered[@]}"

    # buildFHSEnv/bwrap tries to enter the caller's cwd. A root shell or other
    # unreadable cwd fails before steam-guest-run can cd, so move into Steam's
    # Korri-owned state dir before entering the capsule.
    cd "$STEAM_HOME"
    exec ${cfg.package}/bin/steam-arm64-fhs "$@"
  '';

  steamAppInstall = pkgs.writeShellScriptBin "korri-steam-app-install" ''
    set -eu

    usage() {
      echo "usage: korri-steam-app-install <steam-appid>" >&2
      exit 64
    }

    [ "$#" -eq 1 ] || usage
    appid="$1"
    case "$appid" in
      ""|*[!0-9]*) usage ;;
    esac

    exec ${steamLauncher}/bin/korri-steam-guest ${steamClientArgs} -console +app_install "$appid"
  '';

  steamServiceControl = pkgs.writeShellScriptBin "korri-steam-service-control" ''
    set -eu

    usage() {
      echo "usage: korri-steam-service-control <start|stop>" >&2
      exit 64
    }

    [ "$#" -eq 1 ] || usage
    case "$1" in
      start|stop) ;;
      *) usage ;;
    esac

    case "$1" in
      start)
        ${pkgs.systemd}/bin/systemctl reset-failed korri-steam-gamescope.service >/dev/null 2>&1 || true
        exec ${pkgs.systemd}/bin/systemctl --no-block start korri-steam-gamescope.service
        ;;
      stop) exec ${pkgs.coreutils}/bin/timeout 30 ${pkgs.systemd}/bin/systemctl stop korri-steam-gamescope.service ;;
    esac
  '';

  steamRecovery = pkgs.writeShellScriptBin "korri-steam-recover" ''
    set -eu

    steam_home=${lib.escapeShellArg cfg.home}
    beta_channel=${lib.escapeShellArg cfg.betaChannel}
    package_dir="$steam_home/package"
    stamp="$(${pkgs.coreutils}/bin/date -u +%Y%m%d%H%M%S)"
    backup_dir="$steam_home/.backup-package-before-recover-$stamp"
    pending_marker="$package_dir/steam_client_${cfg.betaChannel}_linuxarm64"
    beta_tmp="$package_dir/beta.tmp.$$"
    korri_ipc="/dev/shm/u${toString runtime.uid}-ValveIPCSharedObj-Steam"

    if [ "$(${pkgs.coreutils}/bin/id -u)" -ne 0 ]; then
      echo "korri-steam-recover: must run as root so managed Steam services can be stopped before package repair" >&2
      exit 77
    fi

    echo "korri-steam-recover: stopping Steam services" >&2
    for service in korri-steam-gamescope.service; do
      ${pkgs.systemd}/bin/systemctl stop "$service" 2>/dev/null || true
    done
    for service in korri-steam-gamescope.service; do
      state="$(${pkgs.systemd}/bin/systemctl is-active "$service" 2>/dev/null || true)"
      case "$state" in
        inactive|failed|unknown|"") ;;
        *)
          echo "korri-steam-recover: refusing package repair while $service is $state" >&2
          exit 1
          ;;
      esac
    done
    ${pkgs.systemd}/bin/systemctl reset-failed korri-steam-gamescope.service 2>/dev/null || true

    if [ -d "$package_dir" ]; then
      ${pkgs.coreutils}/bin/cp -a "$package_dir" "$backup_dir"
      echo "korri-steam-recover: backed up package state to $backup_dir" >&2
    else
      ${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 "$package_dir"
      echo "korri-steam-recover: created missing package directory $package_dir" >&2
    fi

    printf '%s\n' "$beta_channel" > "$beta_tmp"
    ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$beta_tmp" 2>/dev/null || true
    ${pkgs.coreutils}/bin/mv -f "$beta_tmp" "$package_dir/beta"
    if [ -e "$pending_marker" ]; then
      ${pkgs.coreutils}/bin/rm -f "$pending_marker"
      echo "korri-steam-recover: removed stale pending marker $pending_marker" >&2
    else
      echo "korri-steam-recover: no pending marker at $pending_marker" >&2
    fi

    if [ -e "$korri_ipc" ]; then
      ${pkgs.coreutils}/bin/rm -f "$korri_ipc" || true
      echo "korri-steam-recover: removed stale Korri Steam IPC $korri_ipc" >&2
    fi

    echo "korri-steam-recover: channel=$beta_channel" >&2
    echo "korri-steam-recover: preserved installed/manifest files in $package_dir" >&2
  '';

  steamWarmup = pkgs.writeShellScriptBin "korri-steam-warm" ''
    set -eu

    runtime_dir=/run/user/${toString runtime.uid}
    wayland_display=wayland-1
    wayland_socket="$runtime_dir/$wayland_display"
    bus_socket="$runtime_dir/bus"

    # The managed Steam system service consumes the real kiosk user's Wayland
    # and D-Bus session. Start it from korri-session.target, but wait for the
    # compositor and bus sockets so boot/session ordering never falls back to
    # ad-hoc direct Steam.
    i=0
    while [ "$i" -lt 120 ]; do
      if [ -S "$wayland_socket" ] && [ -S "$bus_socket" ]; then
        break
      fi
      i=$((i + 1))
      ${pkgs.coreutils}/bin/sleep 1
    done

    if [ ! -S "$wayland_socket" ]; then
      echo "korri-steam-warm: timed out waiting for $wayland_socket" >&2
      exit 1
    fi
    if [ ! -S "$bus_socket" ]; then
      echo "korri-steam-warm: timed out waiting for $bus_socket" >&2
      exit 1
    fi

    exec /run/wrappers/bin/sudo -n ${steamServiceControl}/bin/korri-steam-service-control start
  '';

  steamAppLauncher = pkgs.writeShellScriptBin "korri-steam-app" ''
    set -eu

    usage() {
      echo "usage: korri-steam-app <steam-appid>" >&2
      exit 64
    }

    [ "$#" -eq 1 ] || usage
    appid="$1"
    case "$appid" in
      ""|*[!0-9]*) usage ;;
    esac

    export HOME="''${HOME:-${runtime.home}}"
    export USER="''${USER:-${runtime.user}}"
    export XDG_RUNTIME_DIR="''${XDG_RUNTIME_DIR:-/run/user/${toString runtime.uid}}"
    export WAYLAND_DISPLAY="''${WAYLAND_DISPLAY:-wayland-1}"
    export DISPLAY="''${DISPLAY:-:0}"
    export DBUS_SESSION_BUS_ADDRESS="''${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/${toString runtime.uid}/bus}"
    export PULSE_SERVER="''${PULSE_SERVER:-${korriPulseServer}}"
    export LANG="''${LANG:-C.UTF-8}"
    export STEAM_HOME="''${STEAM_HOME:-${cfg.home}}"
    export STEAM_GAMES_ROOT="''${STEAM_GAMES_ROOT:-${cfg.gamesRoot}}"
    export STEAM_DOT="''${STEAM_DOT:-${cfg.dotDir}}"
    export FEX_ROOTFS="''${FEX_ROOTFS:-${cfg.fexRootfs}}"

    console_log="$STEAM_HOME/logs/console_log.txt"
    launch_timeout="''${KORRI_STEAM_APP_LAUNCH_TIMEOUT:-180}"
    forward_timeout="''${KORRI_STEAM_APP_FORWARD_TIMEOUT:-15}"
    service_ready_timeout="''${KORRI_STEAM_APP_SERVICE_READY_TIMEOUT:-90}"
    service_name="korri-steam-gamescope.service"
    gamescope_display="''${GAMESCOPE_WAYLAND_DISPLAY:-gamescope-0}"
    gamescope_socket="$XDG_RUNTIME_DIR/$gamescope_display"
    require_gamescope_socket="${if cfg.presentationMode == "gamescope" then "1" else "0"}"
    target_audio_sink="''${KORRI_STEAM_AUDIO_SINK:-${cfg.appAudioSinkName}}"
    keep_steam_visible="''${KORRI_STEAM_KEEP_VISIBLE:-${
      if cfg.keepVisibleDuringLaunch then "1" else "0"
    }}"
    stop_service_on_exit="''${KORRI_STEAM_APP_STOP_SERVICE_ON_EXIT:-${
      if cfg.keepWarm then "0" else "1"
    }}"

    find_sway_sock() {
      if [ -n "''${SWAYSOCK:-}" ] && [ -S "$SWAYSOCK" ]; then
        printf '%s\n' "$SWAYSOCK"
        return 0
      fi
      ${pkgs.findutils}/bin/find "$XDG_RUNTIME_DIR" -maxdepth 1 -type s -name 'sway-ipc.*.sock' -print -quit 2>/dev/null || true
    }

    sway() {
      sock="$(find_sway_sock | ${pkgs.coreutils}/bin/head -n 1)"
      [ -n "$sock" ] || return 0
      SWAYSOCK="$sock" ${pkgs.sway}/bin/swaymsg "$@" >/dev/null 2>&1 || true
    }

    sway_tree() {
      sock="$(find_sway_sock | ${pkgs.coreutils}/bin/head -n 1)"
      [ -n "$sock" ] || return 0
      SWAYSOCK="$sock" ${pkgs.sway}/bin/swaymsg -t get_tree 2>/dev/null || true
    }

    focus_korri_output() {
      sway '[app_id="korri-chromium-kiosk"] focus, fullscreen enable'
      sway '[app_id="^chrome-.*"] focus, fullscreen enable'
      sway '[class="Chromium-browser"] focus, fullscreen enable'
    }

    hide_steam_hat() {
      if [ "$keep_steam_visible" != "0" ]; then
        echo "korri-steam-app: leaving Steam visible for Steam launch debugging" >&2
        return 0
      fi
      # Steam can change title during startup and can leave a rootless Xwayland
      # surface behind if it remains fullscreen while the game appears. Disable
      # fullscreen first, then scratchpad every Steam client window class we can
      # address through Sway.
      sway '[class="steam"] fullscreen disable, floating enable, move scratchpad'
      sway '[app_id="steam"] fullscreen disable, floating enable, move scratchpad'
      focus_korri_output
    }

    focus_game() {
      # Steam logs "Game process added" before the Xwayland window is always
      # mapped. Wait for the real game surface, then normalize it to a regular
      # fullscreen tiled container on the kiosk output. Doing this once after
      # map keeps Steam Input focused on the AppID; repeatedly replaying the
      # Steam-hide policy can put the frontend back on top and drop controls.
      i=0
      while [ "$i" -lt 30 ]; do
        if app_removed_since_mark; then
          return 10
        fi
        if sway_tree | ${pkgs.gnugrep}/bin/grep -a -F "\"class\": \"steam_app_$appid\"" >/dev/null 2>&1; then
          sway "[class=\"steam_app_$appid\"] scratchpad show"
          sway "[class=\"steam_app_$appid\"] floating disable, move to workspace 1, fullscreen enable, focus"
          return 0
        fi
        i=$((i + 1))
        ${pkgs.coreutils}/bin/sleep 1
      done
      return 0
    }

    repair_game_audio() {
      [ -n "$target_audio_sink" ] || return 0
      PIPEWIRE_RUNTIME_DIR="''${PIPEWIRE_RUNTIME_DIR:-$XDG_RUNTIME_DIR}"
      export PIPEWIRE_RUNTIME_DIR
      i=0
      while [ "$i" -lt 15 ]; do
        if app_removed_since_mark; then
          return 10
        fi
        outputs="$(${pkgs.pipewire}/bin/pw-link -o 2>/dev/null || true)"
        inputs="$(${pkgs.pipewire}/bin/pw-link -i 2>/dev/null || true)"
        left_output="$(printf '%s\n' "$outputs" | ${pkgs.gnugrep}/bin/grep -E '(^|/)30XX\.exe:output_1$' | ${pkgs.coreutils}/bin/head -n 1 || true)"
        right_output="$(printf '%s\n' "$outputs" | ${pkgs.gnugrep}/bin/grep -E '(^|/)30XX\.exe:output_2$' | ${pkgs.coreutils}/bin/head -n 1 || true)"
        if [ -n "$left_output" ] && [ -n "$right_output" ] && printf '%s\n' "$inputs" | ${pkgs.gnugrep}/bin/grep -F "$target_audio_sink:playback_FL" >/dev/null 2>&1; then
          ${pkgs.pipewire}/bin/pw-link "$left_output" "$target_audio_sink:playback_FL" >/dev/null 2>&1 || true
          ${pkgs.pipewire}/bin/pw-link "$right_output" "$target_audio_sink:playback_FR" >/dev/null 2>&1 || true
          namespace_left="$(printf '%s\n' "$inputs" | ${pkgs.gnugrep}/bin/grep -F 'device.audio_group:pw-audio-namespace.' | ${pkgs.gnugrep}/bin/grep -F ':playback_1' | ${pkgs.coreutils}/bin/head -n 1 || true)"
          namespace_right="$(printf '%s\n' "$inputs" | ${pkgs.gnugrep}/bin/grep -F 'device.audio_group:pw-audio-namespace.' | ${pkgs.gnugrep}/bin/grep -F ':playback_2' | ${pkgs.coreutils}/bin/head -n 1 || true)"
          [ -n "$namespace_left" ] && ${pkgs.pipewire}/bin/pw-link "$left_output" "$namespace_left" >/dev/null 2>&1 || true
          [ -n "$namespace_right" ] && ${pkgs.pipewire}/bin/pw-link "$right_output" "$namespace_right" >/dev/null 2>&1 || true
          return 0
        fi
        i=$((i + 1))
        ${pkgs.coreutils}/bin/sleep 1
      done
      return 0
    }

    cleanup_done=0
    service_start_attempted_at=0

    control_steam_service() {
      action="$1"
      control_timeout="''${KORRI_STEAM_APP_SYSTEMCTL_TIMEOUT:-$service_ready_timeout}"
      if [ "$(${pkgs.coreutils}/bin/id -u)" -eq 0 ]; then
        case "$action" in
          start)
            ${pkgs.systemd}/bin/systemctl reset-failed "$service_name" >/dev/null 2>&1 || true
            ${pkgs.systemd}/bin/systemctl --no-block start "$service_name"
            ;;
          stop) ${pkgs.coreutils}/bin/timeout "$control_timeout" ${pkgs.systemd}/bin/systemctl stop "$service_name" ;;
        esac
        return $?
      fi
      if [ -x /run/wrappers/bin/sudo ]; then
        if ${pkgs.coreutils}/bin/timeout "$control_timeout" /run/wrappers/bin/sudo -n ${steamServiceControl}/bin/korri-steam-service-control "$action"; then
          return 0
        fi
        sudo_status="$?"
        if [ "$action" = "start" ]; then
          # Launch children can have a narrower privilege context than the
          # kiosk user manager. If direct sudo service-control cannot start the
          # system broker, rerun the warmup unit; it performs the same start
          # request from the long-lived user manager context. This makes AppID
          # launches an idempotent ensure instead of depending on boot warmth.
          if ${pkgs.coreutils}/bin/timeout "$control_timeout" ${pkgs.systemd}/bin/systemctl --user restart korri-steam-warm.service; then
            return 0
          fi
        fi
        return "$sudo_status"
      fi
      echo "korri-steam-app: warning: sudo wrapper unavailable; cannot $action $service_name" >&2
      return 1
    }

    request_steam_service_start() {
      now="$(${pkgs.coreutils}/bin/date +%s)"
      if [ "$service_start_attempted_at" -ne 0 ] && [ "$now" -lt $((service_start_attempted_at + 2)) ]; then
        return 0
      fi
      service_start_attempted_at="$now"
      control_steam_service start
    }

    cleanup() {
      [ "$cleanup_done" -eq 0 ] || return 0
      cleanup_done=1
      hide_steam_hat || true
      if [ "$stop_service_on_exit" != "0" ]; then
        control_steam_service stop >/dev/null 2>&1 || \
          echo "korri-steam-app: warning: could not stop $service_name after launch" >&2
      fi
    }

    trap cleanup EXIT
    trap 'cleanup; exit 130' INT
    trap 'cleanup; exit 143' TERM

    ${steamUinputPrep}/bin/korri-steam-ensure-uinput || true
    ${pkgs.coreutils}/bin/mkdir -p "$STEAM_HOME/logs" "$STEAM_HOME/package"
    service_was_active=0
    if ${pkgs.coreutils}/bin/timeout 5 ${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name" 2>/dev/null; then
      service_was_active=1
    fi
    if [ -f "$console_log" ]; then
      mark="$(${pkgs.coreutils}/bin/wc -c < "$console_log" | ${pkgs.coreutils}/bin/tr -d ' ')"
    else
      mark=0
      : > "$console_log" 2>/dev/null || true
    fi

    steam_service_state() {
      state="$(${pkgs.coreutils}/bin/timeout 5 ${pkgs.systemd}/bin/systemctl is-active "$service_name" 2>/dev/null || true)"
      [ -n "$state" ] && printf '%s\n' "$state" || printf 'unknown\n'
    }

    localconfig_files() {
      ${pkgs.findutils}/bin/find "$STEAM_HOME/userdata" -mindepth 3 -maxdepth 3 -path '*/config/localconfig.vdf' -type f -print 2>/dev/null || true
    }

    steam_surface_ready() {
      [ "$require_gamescope_socket" != "1" ] || [ -S "$gamescope_socket" ]
    }

    wait_for_steam_ready() {
      ready_deadline=$(( $(${pkgs.coreutils}/bin/date +%s) + service_ready_timeout ))
      while [ "$(${pkgs.coreutils}/bin/date +%s)" -le "$ready_deadline" ]; do
        ready_log=""
        if [ -f "$console_log" ]; then
          if [ "$service_was_active" -eq 1 ]; then
            # A deliberately prewarmed Steam session emits its readiness lines
            # before this AppID wrapper starts; accept existing evidence as long
            # as the presentation surface for the configured mode is present.
            ready_log="$(${pkgs.coreutils}/bin/cat "$console_log" 2>/dev/null || true)"
          else
            ready_log="$(${pkgs.coreutils}/bin/tail -c +$((mark + 1)) "$console_log" 2>/dev/null || true)"
          fi
        fi
        if steam_surface_ready \
          && printf '%s\n' "$ready_log" | ${pkgs.gnugrep}/bin/grep -a -E -q 'Waiting for compat in post-logon|Loaded Config for Local Selection Path for App ID 769'; then
          return 0
        fi
        service_state="$(steam_service_state)"
        case "$service_state" in
          active|activating|deactivating|reloading) ;;
          inactive)
            if ! request_steam_service_start; then
              return 1
            fi
            ;;
          failed|unknown)
            return 1
            ;;
          *) ;;
        esac
        ${pkgs.coreutils}/bin/sleep 1
      done
      return 1
    }

    if ! ${pkgs.coreutils}/bin/timeout 5 ${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name" 2>/dev/null; then
      if ! request_steam_service_start; then
        echo "korri-steam-app: could not start managed Steam service $service_name" >&2
        exit 125
      fi
    fi

    if ! wait_for_steam_ready; then
      echo "korri-steam-app: timed out waiting for managed Steam readiness before AppID launch" >&2
      exit 125
    fi

    # Keep Steam hidden by default. First-launch gates are pre-seeded by the
    # Steam state reconciler; this wrapper no longer reacts to ShowInterstitials
    # console-log prompts.
    focus_korri_output
    hide_steam_hat
    if ! ${pkgs.coreutils}/bin/timeout "$forward_timeout" ${steamLauncher}/bin/korri-steam-guest ${steamClientArgs} -applaunch "$appid" >/dev/null; then
      echo "korri-steam-app: timed out forwarding AppID $appid to Steam" >&2
      exit 125
    fi
    hide_steam_hat

    log_has() {
      haystack="$1"
      needle="$2"
      ${pkgs.gnugrep}/bin/grep -a -F -q -- "$needle" <<< "$haystack"
    }

    app_removed_since_mark() {
      [ -f "$console_log" ] || return 1
      current_mark="$(${pkgs.coreutils}/bin/wc -c < "$console_log" | ${pkgs.coreutils}/bin/tr -d ' ')"
      if [ "$current_mark" -ge "$mark" ]; then
        removal_log="$(${pkgs.coreutils}/bin/tail -c +$((mark + 1)) "$console_log" 2>/dev/null || true)"
      else
        removal_log="$(${pkgs.coreutils}/bin/cat "$console_log" 2>/dev/null || true)"
      fi
      log_has "$removal_log" "Game process removed: AppID $appid" \
        || log_has "$removal_log" "Game process removed : AppID $appid"
    }

    deadline=$(( $(${pkgs.coreutils}/bin/date +%s) + launch_timeout ))
    saw_added=0
    while true; do
      new_log=""
      if [ -f "$console_log" ]; then
        current_mark="$(${pkgs.coreutils}/bin/wc -c < "$console_log" | ${pkgs.coreutils}/bin/tr -d ' ')"
        if [ "$current_mark" -ge "$mark" ]; then
          new_log="$(${pkgs.coreutils}/bin/tail -c +$((mark + 1)) "$console_log" 2>/dev/null || true)"
        else
          new_log="$(${pkgs.coreutils}/bin/cat "$console_log" 2>/dev/null || true)"
        fi
        mark="$current_mark"
      fi

      if [ "$saw_added" -eq 0 ] && log_has "$new_log" "Game process added : AppID $appid"; then
        saw_added=1
        hide_steam_hat
        if ! focus_game; then
          hide_steam_hat
          exit 0
        fi
        if ! repair_game_audio; then
          hide_steam_hat
          exit 0
        fi
      fi

      if [ "$saw_added" -eq 1 ] \
        && { log_has "$new_log" "Game process removed: AppID $appid" \
          || log_has "$new_log" "Game process removed : AppID $appid"; }; then
        hide_steam_hat
        exit 0
      fi

      if [ "$saw_added" -eq 1 ]; then
        if ! ${pkgs.procps}/bin/ps -eo args= | ${pkgs.gnugrep}/bin/grep -F "SteamLaunch AppId=$appid" | ${pkgs.gnugrep}/bin/grep -v -F "grep -F" >/dev/null; then
          hide_steam_hat
          exit 0
        fi
      elif [ "$(${pkgs.coreutils}/bin/date +%s)" -gt "$deadline" ]; then
        hide_steam_hat
        echo "korri-steam-app: timed out waiting for Steam AppID $appid to launch" >&2
        exit 124
      fi

      ${pkgs.coreutils}/bin/sleep 1
    done
  '';
in
{
  key = "korri-steam";

  options.services.korri.steam = {
    enable = mkEnableOption "Korri guest-native ARM64 Steam adapter";

    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ../packages/steam-korri/package.nix { };
      defaultText = lib.literalExpression "product/plugins/steam/packages/steam-korri";
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

    betaChannel = mkOption {
      type = types.str;
      default = "steamdeck_stable";
      description = ''
        ARM64 Steam client tracking channel written to package/beta and used
        when checking channel-specific linuxarm64 installed markers. Initial
        seed URLs may be separate bootstrap provenance, but the mutable Steam
        install tracks this configured channel.
      '';
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

    keepWarm = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Start the managed Steam service from the Korri user session and keep it
        resident so app launches can forward AppIDs to an already-warm Steam
        client. The warmup waits for the kiosk Wayland and D-Bus sockets before
        using the narrow sudo helper, avoiding ad-hoc direct Steam fallback.
      '';
    };

    keepVisibleDuringLaunch = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Keep the Steam client window visible during AppID launches instead of
        moving it to the Sway scratchpad. This is intended for device proof and
        debugging so prompts, Steam-owned state, and launch transitions remain
        observable. It can be overridden per launch with KORRI_STEAM_KEEP_VISIBLE.
      '';
    };

    presentationMode = mkOption {
      type = types.enum [ "gamescope" "desktop" ];
      default = "gamescope";
      description = ''
        Presentation host for the managed warm Steam client. `gamescope` keeps
        Steam inside the broker used by AppID launch experiments. `desktop`
        runs Steam directly as a Sway client, which preserves the desktop Steam
        UI (`steamwebhelper -uimode=7`) for development/debugging on SM8550.
      '';
    };

    gamescopePreferOutput = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = ''
        Optional Gamescope embedded-mode output preference. Device profiles may
        set this from their display contract when nested/headless Gamescope does
        not present a visible foreground surface. Ignored when
        presentationMode = "desktop".
      '';
    };

    useGamepadUi = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Start Steam with its gamepad UI. This is off by default because the UI
        can capture controller input globally, but some handheld profiles need
        an initial mapped Steam surface so the gamescoped broker becomes visible
        before AppID forwarding.
      '';
    };

    appAudioSinkName = mkOption {
      type = types.str;
      default = "";
      description = "Optional PipeWire sink node name used for bounded AppID audio-route repair.";
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
      steamAppLauncher
      steamAppInstall
      steamServiceControl
      steamRecovery
      steamWarmup
      steamUinputPrep
      fexRootfsPreparer
    ];

    users.groups.${steamInputGroup} = { };

    services.udev.extraRules = lib.mkAfter ''
      # Steam Input's virtual Xbox pads are only for Steam and Steam-launched
      # games. Keep them out of the generic Korri/user input ACL so a warm Steam
      # client cannot leak a dead 28de:11ff pad into non-Steam apps.
      KERNEL=="uinput", SUBSYSTEM=="misc", GROUP="${steamInputGroup}", MODE="0660", TAG-="uaccess", TAG-="seat"
      SUBSYSTEM=="input", KERNEL=="event*", ATTRS{id/vendor}=="28de", ATTRS{id/product}=="11ff", GROUP="${steamInputGroup}", MODE="0660", TAG-="uaccess", TAG-="seat", RUN+="${pkgs.acl}/bin/setfacl -b $env{DEVNAME}"
    '';

    environment.sessionVariables.KORRI_STEAM_APP_INSTALL_HELPER = "${steamAppInstall}/bin/korri-steam-app-install";
    systemd.user.services.korrid =
      lib.mkIf ((config.services.korri.daemon.serviceMode or "system") == "user")
        {
          path = steamMaterializerProbePath;
          environment.KORRI_STEAM_APP_INSTALL_HELPER = "${steamAppInstall}/bin/korri-steam-app-install";
        };
    systemd.services.korrid =
      lib.mkIf ((config.services.korri.daemon.serviceMode or "system") == "system")
        {
          path = steamMaterializerProbePath;
          environment.KORRI_STEAM_APP_INSTALL_HELPER = "${steamAppInstall}/bin/korri-steam-app-install";
        };

    security.sudo.extraRules = [
      {
        users = [ runtime.user ];
        commands = [
          {
            command = "${steamServiceControl}/bin/korri-steam-service-control start";
            options = [ "NOPASSWD" ];
          }
          {
            command = "${steamServiceControl}/bin/korri-steam-service-control stop";
            options = [ "NOPASSWD" ];
          }
        ];
      }
    ];

    systemd.tmpfiles.rules = [
      "d ${cfg.home} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.gamesRoot} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.dotDir} 0700 ${runtime.user} ${runtime.group} -"
      "d ${cfg.fexConfigDir} 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.fexConfigDir}/AppConfig 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.home}/fex-data 0750 ${runtime.user} ${runtime.group} -"
      "d ${cfg.home}/fex-data/RootFS 0750 ${runtime.user} ${runtime.group} -"
    ];

    systemd.user.services.korri-steam-warm = lib.mkIf cfg.keepWarm {
      description = "Warm the Korri guest-native Steam client for AppID launches";
      wantedBy = [ "korri-session.target" ];
      after = [ "korri-compositor.service" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${steamWarmup}/bin/korri-steam-warm";
        RemainAfterExit = false;
      };
    };

    systemd.services.korri-steam-uinput = {
      description = "Prepare the guest uinput device for Steam Input";
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = "${steamUinputPrep}/bin/korri-steam-ensure-uinput";
        RemainAfterExit = true;
      };
    };

    systemd.services.korri-steam-seed = {
      description = "Seed Korri guest-native ARM64 Steam payloads";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      environment = {
        STEAM_HOME = cfg.home;
        STEAM_GAMES_ROOT = cfg.gamesRoot;
        STEAM_DOT = cfg.dotDir;
        STEAM_BETA = cfg.betaChannel;
      };
      serviceConfig = {
        Type = "oneshot";
        User = runtime.user;
        Group = runtime.group;
        WorkingDirectory = "-${cfg.home}";
        ExecStartPre = "+${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${cfg.home} ${cfg.gamesRoot}";
        ExecStart = "${cfg.package}/bin/steam-arm64-seed --apply";
        TimeoutStartSec = "infinity";
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
        TimeoutStartSec = "infinity";
      };
    };

    systemd.services.korri-steam-gamescope = {
      description = "Launch Korri guest-native Steam (${cfg.presentationMode} presentation)";
      after = [
        "korri-steam-uinput.service"
        "korri-steam-seed.service"
        "korri-steam-prepare-fex-rootfs.service"
      ];
      wants = [
        "korri-steam-uinput.service"
        "korri-steam-seed.service"
        "korri-steam-prepare-fex-rootfs.service"
      ];
      environment = {
        HOME = runtime.home;
        USER = runtime.user;
        XDG_RUNTIME_DIR = "/run/user/${toString runtime.uid}";
        WAYLAND_DISPLAY = "wayland-1";
        DISPLAY = ":0";
        DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/${toString runtime.uid}/bus";
        PULSE_SERVER = korriPulseServer;
        STEAM_HOME = cfg.home;
        STEAM_GAMES_ROOT = cfg.gamesRoot;
        STEAM_DOT = cfg.dotDir;
        STEAM_BETA = cfg.betaChannel;
        FEX_ROOTFS = cfg.fexRootfs;
      } // lib.optionalAttrs (cfg.presentationMode == "gamescope") {
        GAMESCOPE_WAYLAND_DISPLAY = "gamescope-0";
      };
      serviceConfig = {
        Type = "simple";
        User = runtime.user;
        Group = runtime.group;
        SupplementaryGroups = [ steamInputGroup ];
        WorkingDirectory = cfg.home;
        LimitNOFILE = 524288;
        ExecStart = "${steamServiceRunner}/bin/korri-steam-service-run";
        Restart = if cfg.keepWarm then "always" else "on-failure";
        RestartForceExitStatus = [ 42 ];
        RestartPreventExitStatus = [ 77 ];
        RestartSec = "2s";
      };
      startLimitBurst = 30;
      startLimitIntervalSec = 300;
    };

  };
}
