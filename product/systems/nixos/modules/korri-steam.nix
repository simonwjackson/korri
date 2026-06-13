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

    make_accessible() {
      ${pkgs.coreutils}/bin/chgrp input /dev/uinput 2>/dev/null || true
      ${pkgs.coreutils}/bin/chmod 0660 /dev/uinput 2>/dev/null || true
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
    prepare_proton_fex_share
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
      if ! ${pkgs.findutils}/bin/find "$STEAM_HOME/package" -maxdepth 1 -name 'steam_client_*_linuxarm64.installed' -print -quit 2>/dev/null | ${pkgs.gnugrep}/bin/grep -q .; then
        # The seed fetches the minimal ARM64 client. A first real Steam launch
        # must be allowed to run Valve's bootstrap/update path once, otherwise
        # steamui can load against an incomplete libvideo/libavutil set.
        filtered=()
        for arg in "$@"; do
          case "$arg" in
            -noverifyfiles|-nobootstrapupdate|-skipinitialbootstrap|-norepairfiles) ;;
            *) filtered+=("$arg") ;;
          esac
        done
        set -- "''${filtered[@]}"
      fi
    fi

    # buildFHSEnv/bwrap tries to enter the caller's cwd. A root shell or other
    # unreadable cwd fails before steam-guest-run can cd, so move into Steam's
    # Korri-owned state dir before entering the capsule.
    cd "$STEAM_HOME"
    exec ${cfg.package}/bin/steam-arm64-fhs "$@"
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

    exec ${pkgs.systemd}/bin/systemctl "$1" korri-steam.service
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
    export LANG="''${LANG:-C.UTF-8}"
    export STEAM_HOME="''${STEAM_HOME:-${cfg.home}}"
    export STEAM_GAMES_ROOT="''${STEAM_GAMES_ROOT:-${cfg.gamesRoot}}"
    export STEAM_DOT="''${STEAM_DOT:-${cfg.dotDir}}"
    export FEX_ROOTFS="''${FEX_ROOTFS:-${cfg.fexRootfs}}"

    console_log="$STEAM_HOME/logs/console_log.txt"
    launch_timeout="''${KORRI_STEAM_APP_LAUNCH_TIMEOUT:-180}"
    service_name="''${KORRI_STEAM_SERVICE:-korri-steam.service}"

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

    hide_steam_hat() {
      sway '[class="steam" title="Steam Big Picture Mode"] move scratchpad'
    }

    show_steam_prompt() {
      sway '[class="steam" title="Steam Big Picture Mode"] scratchpad show, focus, fullscreen enable'
    }

    focus_game() {
      sway "[class=\"steam_app_$appid\"] focus, fullscreen enable"
    }

    ydotool_sock="$XDG_RUNTIME_DIR/korri-steam-ydotool.sock"
    ydotoold_pid=""
    cleanup_done=0

    control_steam_service() {
      action="$1"
      if [ "$(${pkgs.coreutils}/bin/id -u)" -eq 0 ]; then
        ${pkgs.systemd}/bin/systemctl "$action" "$service_name"
        return $?
      fi
      if [ "$service_name" != "korri-steam.service" ]; then
        echo "korri-steam-app: warning: cannot $action overridden service $service_name without root" >&2
        return 1
      fi
      if [ -x /run/wrappers/bin/sudo ]; then
        /run/wrappers/bin/sudo -n ${steamServiceControl}/bin/korri-steam-service-control "$action"
        return $?
      fi
      echo "korri-steam-app: warning: sudo wrapper unavailable; cannot $action $service_name" >&2
      return 1
    }

    cleanup() {
      [ "$cleanup_done" -eq 0 ] || return 0
      cleanup_done=1
      hide_steam_hat || true
      if [ -n "$ydotoold_pid" ]; then
        ${pkgs.procps}/bin/kill "$ydotoold_pid" 2>/dev/null || true
      fi
      ${pkgs.coreutils}/bin/rm -f "$ydotool_sock" 2>/dev/null || true
      if [ "''${KORRI_STEAM_APP_STOP_SERVICE_ON_EXIT:-1}" != "0" ]; then
        control_steam_service stop >/dev/null 2>&1 || \
          echo "korri-steam-app: warning: could not stop $service_name after launch" >&2
      fi
    }

    trap cleanup EXIT
    trap 'cleanup; exit 130' INT
    trap 'cleanup; exit 143' TERM

    ensure_ydotoold() {
      [ "''${KORRI_STEAM_APP_AUTO_CONFIRM:-1}" != "0" ] || return 1
      if [ -S "$ydotool_sock" ]; then
        return 0
      fi
      ${pkgs.coreutils}/bin/rm -f "$ydotool_sock"
      ${pkgs.ydotool}/bin/ydotoold --socket-path="$ydotool_sock" --socket-perm=0600 >/dev/null 2>&1 &
      ydotoold_pid="$!"
      i=0
      while [ "$i" -lt 20 ]; do
        [ -S "$ydotool_sock" ] && return 0
        i=$((i + 1))
        ${pkgs.coreutils}/bin/sleep 0.1
      done
      return 1
    }

    confirm_steam_prompt() {
      [ "''${KORRI_STEAM_APP_AUTO_CONFIRM:-1}" != "0" ] || return 0
      ensure_ydotoold || {
        echo "korri-steam-app: warning: could not start ydotoold to confirm Steam prompt" >&2
        return 0
      }
      # KEY_ENTER down/up. Keep the launch handoff deterministic, but never
      # fail the game launch solely because input injection was unavailable.
      YDOTOOL_SOCKET="$ydotool_sock" ${pkgs.ydotool}/bin/ydotool key 28:1 28:0 >/dev/null 2>&1 || \
        echo "korri-steam-app: warning: could not confirm Steam prompt with ydotool" >&2
    }

    if ${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name" 2>/dev/null; then
      :
    else
      control_steam_service start || \
        echo "korri-steam-app: warning: could not start $service_name; assuming Steam is already reachable in the user session" >&2
    fi

    ${steamUinputPrep}/bin/korri-steam-ensure-uinput || true
    ${pkgs.coreutils}/bin/mkdir -p "$STEAM_HOME/logs"
    if [ -f "$console_log" ]; then
      mark="$(${pkgs.coreutils}/bin/wc -c < "$console_log" | ${pkgs.coreutils}/bin/tr -d ' ')"
    else
      mark=0
      : > "$console_log" 2>/dev/null || true
    fi

    # Steam's ARM64 client only reliably advances AppID launches while Big
    # Picture is available to handle its launch/interstitial state machine.
    # Surface it for the handoff, then move it away once launch proceeds or the
    # game window is up so Korri does not remain a "hat on a hat" stack.
    show_steam_prompt
    ${steamLauncher}/bin/korri-steam-guest \
      -steamdeck -gamepadui -forcedesktopscaling 1.5 -applaunch "$appid" \
      >/dev/null

    deadline=$(( $(${pkgs.coreutils}/bin/date +%s) + launch_timeout ))
    saw_added=0
    saw_prompt=0
    while [ "$(${pkgs.coreutils}/bin/date +%s)" -le "$deadline" ]; do
      new_log=""
      if [ -f "$console_log" ]; then
        new_log="$(${pkgs.coreutils}/bin/tail -c +$((mark + 1)) "$console_log" 2>/dev/null || true)"
      fi

      if printf '%s\n' "$new_log" | ${pkgs.gnugrep}/bin/grep -a -q "LaunchApp waiting for user response to ShowInterstitials"; then
        if [ "$saw_prompt" -eq 0 ]; then
          saw_prompt=1
          show_steam_prompt
          ${pkgs.coreutils}/bin/sleep 0.5
          confirm_steam_prompt
        fi
      fi

      if printf '%s\n' "$new_log" | ${pkgs.gnugrep}/bin/grep -a -q "LaunchApp continues with user response \"ShowInterstitials\""; then
        hide_steam_hat
      fi

      if printf '%s\n' "$new_log" | ${pkgs.gnugrep}/bin/grep -a -q "Game process added : AppID $appid"; then
        saw_added=1
        hide_steam_hat
        focus_game
      fi

      if [ "$saw_added" -eq 1 ] && printf '%s\n' "$new_log" | ${pkgs.gnugrep}/bin/grep -a -q "Game process removed : AppID $appid"; then
        hide_steam_hat
        exit 0
      fi

      if [ "$saw_added" -eq 1 ]; then
        if ! ${pkgs.procps}/bin/ps -eo args= | ${pkgs.gnugrep}/bin/grep -F "SteamLaunch AppId=$appid" | ${pkgs.gnugrep}/bin/grep -v -F "grep -F" >/dev/null; then
          hide_steam_hat
          exit 0
        fi
      fi

      ${pkgs.coreutils}/bin/sleep 1
    done

    hide_steam_hat
    if [ "$saw_added" -eq 1 ]; then
      exit 0
    fi
    echo "korri-steam-app: timed out waiting for Steam AppID $appid to launch" >&2
    exit 124
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
      steamAppLauncher
      steamServiceControl
      steamUinputPrep
      fexRootfsPreparer
    ];

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
        STEAM_BETA = "publicbeta";
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

    systemd.services.korri-steam-runtime-prep = {
      description = "Repair Korri Steam runtime and Proton ARM64 payloads";
      after = [
        "korri-steam-seed.service"
        "korri-steam-prepare-fex-rootfs.service"
      ];
      wants = [
        "korri-steam-seed.service"
        "korri-steam-prepare-fex-rootfs.service"
      ];
      environment = {
        STEAM_HOME = cfg.home;
        FEX_ROOTFS = cfg.fexRootfs;
        FEX_BIN = "${pkgs.fex}/bin/FEX";
        FEX_WRAPPER_BIN = "/usr/bin/FEX";
        FEX_SHARE = "${pkgs.fex}/share/fex-emu";
      };
      serviceConfig = {
        Type = "oneshot";
        User = runtime.user;
        Group = runtime.group;
        WorkingDirectory = "-${cfg.home}";
        ExecStartPre = "+${pkgs.coreutils}/bin/install -d -o ${runtime.user} -g ${runtime.group} -m 0750 ${cfg.home}";
        ExecStart = "${cfg.package}/bin/steam-guest-runtime-prep --apply";
      };
    };

    systemd.paths.korri-steam-runtime-prep = {
      description = "Watch Korri Steam runtime and Proton payloads for repair";
      wantedBy = [ "multi-user.target" ];
      pathConfig = {
        PathChanged = [
          "${cfg.home}/steamapps/common/Proton 11.0 (ARM64)/proton"
          "${cfg.home}/steamapps/common/Proton 10.0/proton"
          "${cfg.home}/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap"
          "${cfg.home}/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb"
        ];
        Unit = "korri-steam-runtime-prep.service";
      };
    };

    systemd.services.korri-steam = {
      description = "Launch Korri guest-native Steam";
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
        Restart = "on-failure";
        RestartSec = "2s";
      };
    };
  };
}
