{
  korri,
  nixpkgs,
  nix-on-rocks,
  deviceProfile,
}:

{
  config,
  lib,
  pkgs,
  ...
}:

let
  targetSystem = pkgs.stdenv.hostPlatform.system;
  substratePackages = nix-on-rocks.packages.${targetSystem};
  # Gamescope >= 3.16.20 is required for the Moonlight v4l2m2m streaming
  # path on SM8550 (see assertion below). `pkgs.gamescope` is globally
  # replaced by the Korri package overlay with gamescope-korri wrapping the
  # validated 3.16.23 base, so this platform module should not construct or
  # force a separate Gamescope package.
  gamescopeKorriControlEnvironment = {
    # gamescope-korri v1 control/readback atoms. Keep these enabled on SM8550
    # so every foreground Gamescope launched by sessiond exposes the expected
    # control surface rather than silently behaving like stock Gamescope.
    GAMESCOPE_XWAYLAND_MODE_CONTROL = "1";
    GAMESCOPE_SCALING_FILTER = "3";
    GAMESCOPE_SHARPNESS = "20";
    GAMESCOPE_FSR_FEEDBACK = "1";
  };
  moonlightRuntimeSettingsEnvironment = {
    # Experimental downstream moonlight-embedded-korri runtime-settings hooks.
    # These are intentionally enumerated and preserved as Moonlight process env
    # through host.moonlight.environment below, not service-wide KORRI_MOONLIGHT_*
    # launch-policy fallbacks. They remain spike scope until the runtime-settings
    # product model graduates.
    MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_AFTER_S = "6";
    MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS = "60";
    MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_KBPS = "12000";
    MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION = "1280x720";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED = "1";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_ENABLE_SPIKE_ADAPTATION = "1";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS = "6000";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS = "30";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS = "12000";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS = "60";
    MOONLIGHT_RUNTIME_SETTINGS_MVP_COOLDOWN_S = "10";
  };
  sm8550 = config.rocknix.sm8550;
  runtime = config.services.korri.runtime;
  # Neutral substrate capabilities owned by nix-on-rocks. Korri reads
  # these to compose the Moonlight launch environment; it must not
  # hard-code Linux video/audio facts in this platform adapter and must
  # not reach into RockNix-specific option paths (e.g.
  # rocknix.sm8550.moonlight.*) for substrate values. The substrate is
  # free to change device profile facts under these neutral options
  # without forcing a Korri edit.
  substrateVideoDecodeBackend = sm8550.video.decodeBackend;
  substrateAudioApi = sm8550.audio.api;
  substrateAudioUcmPath = "${sm8550.audio.ucmPackage}/share/alsa/ucm2";
  substrateAudioSink = sm8550.audio.defaultSink;
  korriPulseServer = "unix:%t/pulse/native";
  korriRuntimeUid = toString (config.users.users.${runtime.user}.uid or 2000);
  korriRuntimeDir = "/run/user/${korriRuntimeUid}";
  # Substrate power-state request channel (nix-on-rocks owns the verb +
  # watcher; this is where the product drops enter/exit markers). Derived
  # from the substrate option so the two stay in sync.
  powerRequestDir = "${config.rocknix.power.runtimeDir}/requests";
  # korri-fakesuspend-toggle -- product fake-suspend policy. Runs as the
  # Korri runtime user (dispatched by inputd) and owns ONLY the session
  # half of suspend/resume: blank the screen via Korri's own compositor
  # socket, freeze/thaw the transient game *.scope units (never the
  # compositor/inputd services, which are .service units and stay alive),
  # then ask the substrate to enter/exit the low-power radio state by
  # dropping a request marker. The substrate verb owns radios + governors
  # + NM recovery; this script never touches them.
  korriFakesuspendToggle = pkgs.writeShellScript "korri-fakesuspend-toggle" ''
    set -u
    export PATH=${lib.makeBinPath (with pkgs; [
      coreutils
      gawk
      gnugrep
      sway
      systemd
    ])}

    request_dir="${powerRequestDir}"
    runtime_dir="''${XDG_RUNTIME_DIR:-${korriRuntimeDir}}"
    state_dir="$runtime_dir/korri-fakesuspend"
    active="$state_dir/active"
    last="$state_dir/last-toggle"
    log="$state_dir/toggle.log"
    mkdir -p "$state_dir" "$request_dir" 2>/dev/null || true

    logline() { echo "$(date -Is) toggle: $*" | tee -a "$log" >&2 || true; }

    sway_screen() {
      sock=$(ls "$runtime_dir"/sway-ipc.*.sock 2>/dev/null | head -1)
      [ -n "$sock" ] || return 0
      SWAYSOCK="$sock" swaymsg "output * power $1" >/dev/null 2>&1 || true
    }

    # Freeze/thaw only the transient game scopes. The compositor and inputd
    # are .service units, so they survive and can repaint on resume.
    freeze_game_scopes() {
      systemctl --user list-units --type=scope --state=running --no-legend 2>/dev/null \
        | awk '{print $1}' \
        | while read -r unit; do
            [ -n "$unit" ] || continue
            systemctl --user freeze "$unit" 2>/dev/null || true
          done
    }
    thaw_game_scopes() {
      systemctl --user list-units --type=scope --no-legend 2>/dev/null \
        | awk '{print $1}' \
        | while read -r unit; do
            [ -n "$unit" ] || continue
            systemctl --user thaw "$unit" 2>/dev/null || true
          done
    }

    do_suspend() {
      logline "suspend: screen off + freeze game scopes + request enter"
      sway_screen off
      freeze_game_scopes
      : > "$active"
      touch "$request_dir/enter.request" 2>/dev/null || true
    }
    do_resume() {
      logline "resume: request exit + thaw game scopes + screen on"
      touch "$request_dir/exit.request" 2>/dev/null || true
      thaw_game_scopes
      sway_screen on
      rm -f "$active" 2>/dev/null || true
    }

    case "''${1:-toggle}" in
      suspend) do_suspend ;;
      resume)  do_resume ;;
      toggle)
        # KEY_POWER autorepeats (value 2) and inputd dispatches on every
        # non-zero value; collapse presses within 2s into one toggle.
        now=$(date +%s)
        if [ -f "$last" ]; then
          prev=$(cat "$last" 2>/dev/null || echo 0)
          if [ $((now - prev)) -lt 2 ]; then
            logline "toggle: debounced"
            exit 0
          fi
        fi
        echo "$now" > "$last"
        if [ -e "$active" ]; then do_resume; else do_suspend; fi
        ;;
      *)
        echo "korri-fakesuspend-toggle: usage: $0 [toggle|suspend|resume]" >&2
        exit 64
        ;;
    esac
  '';
  removableCardsMediaRoot = "/run/media/korri/cards";
  removableCardsContentRoot = "/var/lib/korri/content/removable/cards";
  korriRemovableCardMount = pkgs.writeShellScript "korri-removable-card-mount" ''
    set -eu

    name="$1"
    case "$name" in
      mmcblk*p*) ;;
      *)
        echo "korri-removable-card-mount: ignoring non-SD partition instance: $name" >&2
        exit 0
        ;;
    esac

    dev="/dev/$name"
    media_root="''${KORRI_REMOVABLE_MEDIA_ROOT:-${removableCardsMediaRoot}}"
    content_root="''${KORRI_REMOVABLE_CONTENT_ROOT:-${removableCardsContentRoot}}"
    mountpoint="$media_root/$name"

    if [ ! -b "$dev" ]; then
      echo "korri-removable-card-mount: $dev is not a block device; skipping" >&2
      exit 0
    fi

    fs_type="$(${pkgs.util-linux}/bin/blkid -o value -s TYPE "$dev" 2>/dev/null || true)"
    if [ -z "$fs_type" ]; then
      echo "korri-removable-card-mount: $dev has no filesystem type; skipping" >&2
      exit 0
    fi

    uid="$(${pkgs.coreutils}/bin/id -u ${runtime.user})"
    gid="$(${pkgs.coreutils}/bin/id -g ${runtime.user})"

    ${pkgs.coreutils}/bin/mkdir -p "$media_root" /var/lib/korri/content/removable "$mountpoint"
    if [ ! -e "$content_root" ]; then
      ${pkgs.coreutils}/bin/ln -s "$media_root" "$content_root"
    fi
    ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} \
      /run/media/korri \
      "$media_root" \
      /var/lib/korri/content/removable \
      "$mountpoint" \
      2>/dev/null || true

    # Use mountpoint(1) so we only short-circuit when the exact target is a
    # mount, not when a parent directory of the target is mounted (e.g. /run).
    if ${pkgs.util-linux}/bin/mountpoint -q "$mountpoint"; then
      exit 0
    fi
    # Some container/nspawn layouts pre-bind block-device nodes from the host
    # under /dev itself (e.g. `devtmpfs on /dev/mmcblk0p1`). Don't treat the
    # device node bind as the filesystem mount we want.
    if ${pkgs.util-linux}/bin/findmnt -rn --source "$dev" --types "$fs_type" >/dev/null; then
      exit 0
    fi

    case "$fs_type" in
      vfat|exfat|ntfs|ntfs3)
        mount_options="rw,nosuid,nodev,relatime,uid=$uid,gid=$gid,umask=022"
        ;;
      *)
        mount_options="rw,nosuid,nodev,relatime"
        ;;
    esac

    ${pkgs.util-linux}/bin/mount -t "$fs_type" -o "$mount_options" "$dev" "$mountpoint"
  '';
  korriRemovableCardColdplug = pkgs.writeShellScript "korri-removable-card-coldplug" ''
    set -eu

    for sysdir in /sys/class/block/mmcblk*p*; do
      [ -d "$sysdir" ] || continue
      name=$(${pkgs.coreutils}/bin/basename "$sysdir")
      dev="/dev/$name"
      [ -b "$dev" ] || continue
      fs_type=$(${pkgs.util-linux}/bin/blkid -o value -s TYPE "$dev" 2>/dev/null || true)
      [ -n "$fs_type" ] || continue
      ${pkgs.systemd}/bin/systemctl start --no-block "korri-removable-card-mount@$name.service" || true
    done
  '';
  korriRemovableCardUnmount = pkgs.writeShellScript "korri-removable-card-unmount" ''
    set -eu

    name="$1"
    media_root="''${KORRI_REMOVABLE_MEDIA_ROOT:-${removableCardsMediaRoot}}"
    mountpoint="$media_root/$name"

    if ${pkgs.util-linux}/bin/mountpoint -q "$mountpoint"; then
      ${pkgs.util-linux}/bin/umount -l "$mountpoint" || true
    fi
    ${pkgs.coreutils}/bin/rmdir "$mountpoint" 2>/dev/null || true
  '';
  # The substrate now leaves UCM verb/device and the manual PCM null for panels
  # (e.g. Odin 2 Portal) where WirePlumber owns default-sink selection. Guard
  # every sink-derived interpolation so the bootstrap renders for any substrate
  # contract: the UCM-profile preference only runs when both verb and device are
  # declared, and the manual `module-alsa-sink` fallback only runs when a PCM is
  # declared. With neither, the unit becomes an ordering-only no-op and audio
  # relies on WirePlumber, matching the substrate's own conditional bootstrap.
  substrateAudioSinkHasUcm =
    substrateAudioSink.ucmVerb != null && substrateAudioSink.ucmDevice != null;
  substrateAudioSinkHasPcm = substrateAudioSink.pcm != null;
  korriSm8550AudioBootstrap = pkgs.writeShellScript "korri-sm8550-audio-bootstrap" (
    ''
    set -u

    fallback_sink=${lib.escapeShellArg substrateAudioSink.name}

    for _ in $(${pkgs.coreutils}/bin/seq 1 60); do
      if ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
        break
      fi
      ${pkgs.coreutils}/bin/sleep 0.5
    done

    if ! ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
      echo "korri-sm8550-audio-bootstrap: PulseAudio socket unavailable at $PULSE_SERVER" >&2
      exit 0
    fi
''
    + lib.optionalString substrateAudioSinkHasUcm ''

    preferred_card="alsa_card.platform-sound"
    preferred_profile=${lib.escapeShellArg "${toString substrateAudioSink.ucmVerb} (Headphones, ${toString substrateAudioSink.ucmDevice})"}
    preferred_sink="alsa_output.platform-sound.${toString substrateAudioSink.ucmVerb}__${toString substrateAudioSink.ucmDevice}__sink"

    if ${pkgs.pulseaudio}/bin/pactl list cards | ${pkgs.gnugrep}/bin/grep -Fq "$preferred_profile"; then
      ${pkgs.pulseaudio}/bin/pactl set-card-profile "$preferred_card" "$preferred_profile" >/dev/null 2>&1 || true
      if ${pkgs.pulseaudio}/bin/pactl list short sinks | ${pkgs.gnugrep}/bin/grep -q "^.*[[:space:]]$preferred_sink[[:space:]]"; then
        ${pkgs.pulseaudio}/bin/pactl set-default-sink "$preferred_sink" >/dev/null 2>&1 || true
        exit 0
      fi
    fi
''
  + lib.optionalString substrateAudioSinkHasPcm ''

    # Fallback for kernels/profiles where WirePlumber exposes only Pro Audio:
    # create the substrate-declared PCM sink directly and make it default.
    if ! ${pkgs.pulseaudio}/bin/pactl list short sinks | ${pkgs.gnugrep}/bin/grep -q "^[0-9][0-9]*[[:space:]]$fallback_sink[[:space:]]"; then
      ${pkgs.pulseaudio}/bin/pactl load-module module-alsa-sink \
        device=${lib.escapeShellArg (toString substrateAudioSink.pcm)} \
        sink_name="$fallback_sink" \
        sink_properties=device.description=${lib.escapeShellArg substrateAudioSink.description} \
        >/dev/null 2>&1 || true
    fi

    ${pkgs.pulseaudio}/bin/pactl set-default-sink "$fallback_sink" >/dev/null 2>&1 || true
''
  );
  inputplumberPackage =
    pkgs.runCommand "korri-rocknix-inputplumber-xb360"
      {
        meta.mainProgram = "inputplumber";
      }
      ''
        cp -a ${substratePackages.inputplumber} $out
        chmod -R u+w $out
        substituteInPlace $out/share/inputplumber/devices/02-ayn-controller.yaml \
          --replace-fail "  - xbox-series" "  - xb360"
      '';
  # Moonlight platform launch policy is rendered into the readable library
  # cascade as host.moonlight. The platform.name mapping is intentionally
  # identity today because Moonlight Embedded uses the same names the substrate
  # exposes, but deriving it here keeps this adapter from hard-coding v4l2m2m.
  moonlightPlatformDefaults = {
    host.moonlight = {
      command = "${pkgs.moonlight-embedded}/bin/moonlight";
      environment = moonlightRuntimeSettingsEnvironment // {
        SDL_AUDIODRIVER = substrateAudioApi;
        SDL_VIDEODRIVER = "wayland";
        XDG_CACHE_HOME = "${runtime.home}/.cache";
      };
      platform.name = substrateVideoDecodeBackend;
      input = {
        mappingFile = "${pkgs.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt";
        touch = {
          absolute = true;
          requireBounds = true;
        };
      };
      window.autoResize = true;
      control = {
        enable = true;
        authority = "controller";
      };
    };
  };
  # SDL clients (Moonlight, Cemu) talk to the substrate audio graph via
  # the API nix-on-rocks exposes. The substrate currently reports
  # pulseaudio; Korri applies it as SDL_AUDIODRIVER. If the substrate
  # later declares a different API, Korri's launch env follows without
  # editing this file.
  moonlightCompositorEnvironment = {
    SDL_AUDIODRIVER = substrateAudioApi;
    SDL_VIDEODRIVER = "wayland";
    XDG_CACHE_HOME = "${runtime.home}/.cache";
  };
  moonlightSessiondEnvironment = {
    SDL_AUDIODRIVER = substrateAudioApi;
    XDG_CACHE_HOME = "${runtime.home}/.cache";
  };
in
{
  imports = [
    nix-on-rocks.nixosModules.rocknix-guest-base
    deviceProfile
  ];

  assertions = [
    {
      assertion =
        (config.services.korri.compositor.gamescope.package.pname or "") == "gamescope-korri"
        && toString config.services.korri.compositor.gamescope.package == toString pkgs.gamescope;
      message = "RockNix SM8550 compositors must use globally overlaid pkgs.gamescope (gamescope-korri).";
    }
    {
      # Gamescope's pipewire-loop-lock fix is required whenever the
      # substrate-declared video decode backend exercises the v4l2m2m
      # zero-copy import path. Tying the assertion to the substrate
      # capability keeps the reason for the version floor machine-checkable
      # rather than buried in a hard-coded string.
      assertion =
        substrateVideoDecodeBackend != "v4l2m2m"
        || lib.versionAtLeast (lib.getVersion config.services.korri.compositor.gamescope.package) "3.16.20";
      message = "RockNix SM8550 compositors require Gamescope >= 3.16.20 when the substrate declares video.decodeBackend = v4l2m2m.";
    }
  ];

  services.inputplumber.package = lib.mkForce inputplumberPackage;

  services.udev.extraRules = ''
    # Rootless wlroots compositors acquire DRM through logind/libseat, so the
    # SM8550 KMS card must be attached to seat0. RockNIX guest device events do
    # not currently carry systemd's generic seat tags for this platform node.
    SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"

    # Swappable game/content cards are operator media, not durable internal
    # guest storage. Mount each visible SD-card filesystem partition by kernel
    # instance so cards do not need stable labels or UUIDs and multi-slot
    # devices can expose more than one card at once.
    ACTION=="add|change", SUBSYSTEM=="block", KERNEL=="mmcblk*p*", ENV{ID_FS_USAGE}=="filesystem", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-card-mount@%k.service"
    ACTION=="remove", SUBSYSTEM=="block", KERNEL=="mmcblk*p*", TAG+="systemd", ENV{SYSTEMD_WANTS}+="korri-removable-card-unmount@%k.service"

    # Korri inputd runs as the kiosk user and reads evdev directly before
    # forwarding controller events to the desktop renderer. On the RockNIX
    # SM8550 substrate these event nodes can inherit a numeric group that does
    # not match the NixOS input group, and InputPlumber-created virtual nodes
    # can be created after the static group/mode rewrite. Restate both the
    # group/mode invariant and an explicit Korri ACL so inputd can read the
    # normalized controller without boot-time live ACL repair.
    SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess", RUN+="${pkgs.acl}/bin/setfacl -m u:${runtime.user}:rw /dev/input/%k"
  '';

  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

  systemd.tmpfiles.rules = [
    "d /run/media/korri 0755 ${runtime.user} ${runtime.group} -"
    "d ${removableCardsMediaRoot} 0755 ${runtime.user} ${runtime.group} -"
    "d /var/lib/korri/content/removable 0750 ${runtime.user} ${runtime.group} -"
    "L+ ${removableCardsContentRoot} - - - - ${removableCardsMediaRoot}"
  ];

  systemd.services."korri-removable-card-mount@" = {
    description = "Mount Korri removable SD-card partition %I";
    after = [ "systemd-udevd.service" ];
    environment = {
      KORRI_REMOVABLE_MEDIA_ROOT = removableCardsMediaRoot;
      KORRI_REMOVABLE_CONTENT_ROOT = removableCardsContentRoot;
    };
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${korriRemovableCardMount} %I";
    };
  };

  systemd.services."korri-removable-card-unmount@" = {
    description = "Unmount Korri removable SD-card partition %I";
    after = [ "systemd-udevd.service" ];
    environment = {
      KORRI_REMOVABLE_MEDIA_ROOT = removableCardsMediaRoot;
    };
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${korriRemovableCardUnmount} %I";
    };
  };

  # Cards already present at boot do not emit a fresh ACTION=add the udev
  # rule above can consume, so the per-partition SYSTEMD_WANTS handler never
  # fires. Re-trigger a synthetic change event for every block-device
  # filesystem partition once systemd has started so coldplugged cards mount
  # without operator interaction.
  systemd.services.korri-removable-card-coldplug = {
    description = "Coldplug Korri removable SD-card partitions";
    wantedBy = [ "multi-user.target" ];
    after = [ "systemd-udevd.service" "systemd-tmpfiles-setup.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = toString korriRemovableCardColdplug;
    };
  };

  # The guest sees DRM and input devices that already exist in the
  # ROCKNIX-hosted device namespace. Host-bound nodes do not emit a fresh
  # guest `add` event, so the guest udev rules above never fire for them.
  # Reprocess both subsystems before greetd starts: DRM so logind attaches
  # card0 to seat0 (rootless Sway can acquire DRM), and input so the
  # `setfacl u:${runtime.user}:rw` rule lands on the bare button nodes
  # (pmic_pwrkey/pmic_resin/gpio-keys). Without the input re-trigger, inputd
  # retry-loops on EACCES forever and the power/lid buttons never dispatch.
  # Running before greetd keeps the re-trigger off the live InputPlumber
  # session.
  systemd.services.korri-rocknix-seat-device-trigger = {
    description = "Apply Korri RockNIX seat + input udev metadata";
    wantedBy = [ "multi-user.target" ];
    after = [ "systemd-udevd.service" ];
    before = [ "greetd.service" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = [
        "${pkgs.systemd}/bin/udevadm trigger --subsystem-match=drm --action=change"
        "${pkgs.systemd}/bin/udevadm trigger --subsystem-match=input --action=change"
      ];
      RemainAfterExit = true;
    };
  };

  # Korri SM8550 runs a real greetd/logind session as the non-root Korri
  # runtime user. Keep audio in that same user session instead of starting the
  # legacy nix-on-rocks root main-space PipeWire graph under /run/user/0.
  # The substrate still supplies the neutral SM8550 audio facts (Pulse API and
  # AYN UCM package), but the product owns where the graph lives.
  services.korri.runtime.extraGroups = [ "audio" "input" "render" "seat" "video" ];

  systemd.services.main-space-pipewire.enable = lib.mkForce false;
  systemd.services.main-space-pipewire-pulse.enable = lib.mkForce false;
  systemd.services.main-space-wireplumber.enable = lib.mkForce false;
  systemd.services.main-space-audio-sink-bootstrap.enable = lib.mkForce false;

  # Ownership flip (2026-06-10): the substrate no longer reads buttons or
  # owns session policy. Korri owns power/lid/volume button policy via inputd
  # (below) and drives the product-agnostic substrate power verb through its
  # request channel. Make that channel writable by the Korri runtime group so
  # korri-fakesuspend-toggle can drop markers without root/polkit.
  rocknix.power.requestGroup = runtime.group;

  systemd.user.services.pipewire.environment = {
    ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
    PULSE_SERVER = korriPulseServer;
  };
  systemd.user.services.pipewire-pulse.environment = {
    ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
    PULSE_SERVER = korriPulseServer;
  };
  systemd.user.services.wireplumber.environment = {
    ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
    PULSE_SERVER = korriPulseServer;
  };

  systemd.user.services.korri-sm8550-audio-bootstrap = {
    description = "Bootstrap Korri SM8550 user-session audio sink";
    wantedBy = [ "korri-session.target" ];
    after = [ "pipewire.service" "pipewire-pulse.service" "wireplumber.service" ];
    wants = [ "pipewire.service" "pipewire-pulse.service" "wireplumber.service" ];
    before = [ "korri-compositor.service" "korri-sessiond.service" "korri-inputd.service" ];
    environment = {
      ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
      PULSE_SERVER = korriPulseServer;
    };
    serviceConfig = {
      Type = "oneshot";
      ExecStart = korriSm8550AudioBootstrap;
      RemainAfterExit = true;
    };
  };

  systemd.user.services.korri-compositor.serviceConfig.UnsetEnvironment = [
    "DISPLAY"
    "WAYLAND_DISPLAY"
  ];

  services.korri.compositor = {
    user = lib.mkDefault runtime.user;
    group = lib.mkDefault runtime.group;
    createUser = lib.mkDefault false;
    home = lib.mkDefault runtime.home;
    runtimeDir = lib.mkDefault "%t";

    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=%t/bus";
    };

    gamescope.package = lib.mkDefault pkgs.gamescope;

    path = with pkgs; [
      coreutils
      dbus
      foot
      swaybg
      swaylock
      bashInteractive
      fuzzel
      git
      sway
      config.services.korri.compositor.gamescope.package
      substratePackages.cemu
      # `pkgs.moonlight-embedded` is globally replaced by
      # `moonlight-embedded-korri` via the Korri package overlay, matching the
      # `pkgs.gamescope` -> `gamescope-korri` substitution above.
      pkgs.moonlight-embedded
    ];

    environment =
      moonlightCompositorEnvironment
      // gamescopeKorriControlEnvironment
      // {
        XDG_CURRENT_DESKTOP = "sway";
        CEMU_BIOS_ROOT = "/storage/roms/bios/cemu";
        CEMU_AFFINITY_MASK = sm8550.performance.cemuAffinityMask;
        WLR_NO_HARDWARE_CURSORS = "1";
        WLR_LIBINPUT_NO_DEVICES = "1";
        USER = runtime.user;
      };

    sway.extraConfig = ''
      # ROCKNIX SM8550 display/session fragment supplied by nix-on-rocks.
      seat * hide_cursor 1000
      default_border none

      ${sm8550.display.swayDeviceConfig}
    '';
  };

  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
    services = lib.mkDefault [ "inputplumber.service" ];
  };

  # Korri owns hardware button policy. inputd reads KEY_POWER / SW_LID and
  # dispatches the product fake-suspend toggle, which blanks the screen and
  # freezes game scopes before asking the substrate to drop the radios.
  #   - power button  -> toggle (debounced suspend/resume)
  #   - lid close/open -> explicit suspend/resume edges
  #   - volume up/down -> inputd's built-in `pactl set-sink-volume` default
  #     (PULSE_SERVER below points it at the Korri user-session graph); no
  #     override needed now that the substrate volume handler is gone.
  services.korri.input.inputd.environment = {
    KORRI_INPUTD_POWER_SUSPEND = "${korriFakesuspendToggle}";
    KORRI_INPUTD_LID_CLOSED = "${korriFakesuspendToggle} suspend";
    KORRI_INPUTD_LID_OPENED = "${korriFakesuspendToggle} resume";
    KORRI_SESSIOND_SOCKET = config.services.korri.sessiond.socketPath;
    PULSE_SERVER = korriPulseServer;
  };

  # Sessiond now owns foreground launches directly, and korrid composes
  # remote-source Moonlight argv before delegating to sessiond. Keep the
  # SM8550 Moonlight adapter on both units; compositor-only env was enough
  # when Sway spawned Moonlight children, but not after renderer/sessiond
  # lifecycle ownership moved out of the compositor process tree.
  services.korri.sessiond = {
    path = [ pkgs.moonlight-embedded ];
    extraEnvironment =
      moonlightSessiondEnvironment
      // gamescopeKorriControlEnvironment
      // {
        PULSE_SERVER = korriPulseServer;
      };
  };

  services.korri.daemon.library.platformDefaults = moonlightPlatformDefaults;

  systemd.user.services.korrid.environment = gamescopeKorriControlEnvironment;

  # NOTE: `rocknix.sm8550.moonlight.{enable,package}` is no longer set
  # here. Moonlight is a Korri product choice; the substrate should not
  # carry an installer/option pair for it. Korri's compositor and
  # sessiond paths above already pull `pkgs.moonlight-embedded` into
  # their PATHs explicitly, and the persistent client keydir is owned
  # by Korri's appliance composition. The substrate-side guest module
  # guarding those options is scheduled for removal in a follow-up
  # nix-on-rocks PR now that this file stops setting them.

  # Korri-owned long-running services run inside the greetd-created Korri
  # runtime user's systemd --user manager. Root remains a substrate/setup
  # boundary only; do not reintroduce root lingering or /run/user/0 here.

  # `switch-to-configuration switch` updates /nix/var/nix/profiles/system,
  # but the nspawn host's rocknix-guest-prep selects the guest generation
  # to boot from /nix/var/nix/profiles/per-user/root/rocknix-guest-system
  # (see nix-on-rocks: guest profiles + rocknix-guest-prep helper). Without
  # this script the runtime activation succeeds but the next reboot reverts
  # to whatever generation rocknix-guest-promote installed. Keep the rocknix
  # boot pointer in sync with the active system on every switch.
  # `$systemConfig` is the new toplevel path that switch-to-configuration
  # injects when running activation scripts. Referencing
  # `config.system.build.toplevel` directly would create an infinite
  # recursion because the activation script is itself part of the toplevel.
  system.activationScripts.korri-rocknix-guest-profile = {
    text = ''
      profile_dir=/nix/var/nix/profiles/per-user/root
      ${pkgs.coreutils}/bin/mkdir -p "$profile_dir"
      ${pkgs.nix}/bin/nix-env \
        --profile "$profile_dir/rocknix-guest-system" \
        --set "$systemConfig"
    '';
    deps = [ "users" ];
  };

  systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkForce (
    lib.concatStringsSep ":" [
      "/run/current-system/sw/share"
      "${config.services.inputplumber.package}/share"
    ]
  );

  environment.etc."rocknix-stage10-proof-marker".text = ''
    korri-sm8550-kiosk-system
    target=${config.networking.hostName}
  '';

  environment.systemPackages = [
    substratePackages.cemu
    substratePackages.steam
  ];
}
