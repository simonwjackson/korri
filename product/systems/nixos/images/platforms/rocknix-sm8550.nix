{ korri
, nixpkgs
, nix-on-rocks
, deviceProfile
,
}:

{ config
, lib
, pkgs
, ...
}:

let
  targetSystem = pkgs.stdenv.hostPlatform.system;
  substratePackages = nix-on-rocks.packages.${targetSystem};
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  ryubingPackage = korri.packages.${targetSystem}.ryubing-korri;
  yfsPackage = korri.packages.${targetSystem}.yoshis-fabrication-station;
  webCanvasPackage = korri.packages.${targetSystem}.korri-web-canvas;
  box64RuntimePackage = korri.packages.${targetSystem}.korri-box64-runtime or pkgs.box64;
  gamescopeControlEnvironment = gamescopeNix.controlEnvironment;
  enabledFirstPartyPlugins = "@korri:3dsen,@korri:am2rlauncher,@korri:box64-runtime,@korri:dome-romantik,@korri:gamescope,@korri:globeba,@korri:mega-man-rock-n-roll,@korri:neverball,@korri:remap,@korri:retroarch,@korri:ryubing,@korri:shipwright,@korri:smb-wonderland-1987,@korri:sonic-3-air,@korri:sonic-time-twisted,@korri:spelunky-classic-hd,@korri:srb2kart,@korri:stargrove-scramble,@korri:steam,@korri:tiny-crate,@korri:tmnt-rescue-palooza,@korri:turnip,@korri:webpage,@korri:web-canvas,@korri:xjlt,@korri:yoshis-fabrication-station,@korri:zquest-classic";
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
  substrateAudioRoute = config.rocknix.device.audio.route;
  substrateAudioCard = config.rocknix.device.audio.card;
  substrateAudioUcmCard = config.rocknix.device.audio.ucmCard;
  substrateAudioSink = sm8550.audio.defaultSink;
  substrateAudioRouteKind = substrateAudioRoute.kind;
  substrateAudioRouteIsUcm = substrateAudioRouteKind == "wireplumber-ucm";
  substrateAudioRouteIsManual = substrateAudioRouteKind == "manual-pcm";
  substrateAudioRouteHasUcmVerb = substrateAudioRoute.ucmVerb != null;
  substrateAudioRouteHasUcmDevice = substrateAudioRoute.ucmDevice != null;
  substrateAudioRouteHasFullUcm = substrateAudioRouteHasUcmVerb && substrateAudioRouteHasUcmDevice;
  substrateAudioTargetSink =
    if substrateAudioRouteIsUcm then
      substrateAudioRoute.expectedSink
    else if substrateAudioRouteIsManual then
      substrateAudioRoute.sinkName
    else
      substrateAudioSink.name;
  korriPulseServer = "unix:%t/pulse/native";
  korriSafeDefaultSinkVolume = "10%";
  korriRuntimeUid = toString (config.users.users.${runtime.user}.uid or 2000);
  korriRuntimeDir = "/run/user/${korriRuntimeUid}";
  # Substrate power-state request channel (nix-on-rocks owns the verb +
  # watcher; this is where the product drops enter/exit markers). Derived
  # from the substrate option so the two stay in sync.
  powerRequestDir = "${config.rocknix.power.runtimeDir}/requests";
  korriRocknixSeatDeviceSetup = pkgs.writeShellScript "korri-rocknix-seat-device-setup" ''
    set -u
    export PATH=${
      lib.makeBinPath (
        with pkgs;
        [
          acl
          coreutils
          gnugrep
          systemd
        ]
      )
    }

    # Host-bound ROCKNIX device nodes already exist when the guest boots, so
    # ask udev to re-apply rules when the nspawn sysfs allows it. On Sobo the
    # DRM sysfs uevent file is read-only from the guest; that path must be a
    # warning, not a failed boot gate.
    udevadm control --reload >/dev/null 2>&1 || true
    udevadm trigger --subsystem-match=drm --action=change || true
    udevadm trigger --subsystem-match=input --action=change || true
    udevadm trigger --subsystem-match=sound --action=change || true

    # The guest's numeric device groups can differ from the NixOS group ids
    # (for example tty/input/sound nodes inherited from the ROCKNIX host).
    # Directly grant the runtime user access to the nodes wlroots/inputd/audio
    # need so the appliance can start even when guest udev cannot tag the host
    # devices.
    for node in /dev/dri/card* /dev/dri/renderD* /dev/input/event* /dev/snd/* /dev/tty0 /dev/tty1; do
      [ -e "$node" ] || continue
      setfacl -m m::rw,u:${runtime.user}:rw "$node" || true
    done
  '';
  korriRocknixDeviceAclFallback = pkgs.writeShellScript "korri-rocknix-device-acl-fallback" ''
    set -u
    export PATH=${
      lib.makeBinPath (
        with pkgs;
        [
          acl
          coreutils
        ]
      )
    }

    # greetd/logind can re-open and chmod tty1 while creating the runtime
    # session, after the early setup unit has run. Re-apply only ACLs after
    # greetd starts; the compositor unit has Restart=on-failure and will
    # recover once these permissions are present.
    sleep 2
    for node in /dev/dri/card* /dev/dri/renderD* /dev/input/event* /dev/snd/* /dev/tty0 /dev/tty1; do
      [ -e "$node" ] || continue
      setfacl -m m::rw,u:${runtime.user}:rw "$node" || true
    done
  '';
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
    export PATH=${
      lib.makeBinPath (
        with pkgs;
        [
          coreutils
          gawk
          gnugrep
          sway
          systemd
        ]
      )
    }

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
  # The substrate now exposes explicit audio route strategy under
  # rocknix.device.audio.route.*. Korri runs the PipeWire graph in the kiosk
  # user's logind session, but it follows the substrate route contract instead
  # of hard-coding a hardware PCM or hydrating sound-card udev records itself.
  korriSm8550AudioBootstrap = pkgs.writeShellScript "korri-sm8550-audio-bootstrap" (
    ''
      set -u

      target_sink=${lib.escapeShellArg substrateAudioTargetSink}
      korri_safe_default_sink_volume=${lib.escapeShellArg korriSafeDefaultSinkVolume}

      for _ in $(${pkgs.coreutils}/bin/seq 1 60); do
        if ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
          break
        fi
        ${pkgs.coreutils}/bin/sleep 0.5
      done

      if ! ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
        echo "korri-sm8550-audio-bootstrap: PulseAudio socket unavailable at $PULSE_SERVER" >&2
        exit 1
      fi

      sink_exists() {
        ${pkgs.pulseaudio}/bin/pactl list short sinks \
          | ${pkgs.coreutils}/bin/cut -f2 \
          | ${pkgs.gnugrep}/bin/grep -Fxq -- "$1"
      }

    ''
    + lib.optionalString substrateAudioRouteHasFullUcm ''
      ${pkgs.alsa-utils}/bin/alsaucm -c ${lib.escapeShellArg substrateAudioUcmCard} \
        set _verb ${lib.escapeShellArg (toString substrateAudioRoute.ucmVerb)} \
        set _enadev ${lib.escapeShellArg (toString substrateAudioRoute.ucmDevice)} \
        >/dev/null || {
          echo "korri-sm8550-audio-bootstrap: failed to activate UCM ${toString substrateAudioRoute.ucmVerb}/${toString substrateAudioRoute.ucmDevice} on ${substrateAudioUcmCard}" >&2
          exit 1
        }
    ''
    + lib.optionalString (substrateAudioRouteHasUcmVerb && !substrateAudioRouteHasUcmDevice) ''
      ${pkgs.alsa-utils}/bin/alsaucm -c ${lib.escapeShellArg substrateAudioUcmCard} \
        set _verb ${lib.escapeShellArg (toString substrateAudioRoute.ucmVerb)} \
        >/dev/null || {
          echo "korri-sm8550-audio-bootstrap: failed to activate UCM verb ${toString substrateAudioRoute.ucmVerb} on ${substrateAudioUcmCard}" >&2
          exit 1
        }
    ''
    + ''

      clamp_named_sink() {
        sink="$1"
        for _ in $(${pkgs.coreutils}/bin/seq 1 40); do
          if sink_exists "$sink"; then
            if ${pkgs.pulseaudio}/bin/pactl set-default-sink "$sink" >/dev/null 2>&1 \
              && ${pkgs.pulseaudio}/bin/pactl set-sink-volume "$sink" "$korri_safe_default_sink_volume" >/dev/null 2>&1; then
              return 0
            fi
          fi
          ${pkgs.coreutils}/bin/sleep 0.25
        done
        echo "korri-sm8550-audio-bootstrap: target sink $sink unavailable for safe volume clamp" >&2
        return 1
      }

      clamp_default_sink() {
        for _ in $(${pkgs.coreutils}/bin/seq 1 40); do
          default_sink="$(${pkgs.pulseaudio}/bin/pactl get-default-sink 2>/dev/null || true)"
          case "$default_sink" in
            ""|auto_null*) ${pkgs.coreutils}/bin/sleep 0.25; continue ;;
          esac
          if ${pkgs.pulseaudio}/bin/pactl set-sink-volume "$default_sink" "$korri_safe_default_sink_volume" >/dev/null 2>&1; then
            return 0
          fi
          ${pkgs.coreutils}/bin/sleep 0.25
        done
        echo "korri-sm8550-audio-bootstrap: non-null default sink unavailable for safe volume clamp" >&2
        return 1
      }
    ''
    + lib.optionalString substrateAudioRouteIsUcm ''

      # The substrate-declared UCM route is graph-owned by WirePlumber. Wait
      # for that exact sink and clamp graph volume; do not load a direct ALSA
      # sink because that bypasses handheld volume policy.
      clamp_named_sink "$target_sink"
    ''
    + lib.optionalString substrateAudioRouteIsManual ''

      # Compatibility for substrate profiles that still declare an explicit
      # manual PCM route. SM8550 handhelds should normally use wireplumber-ucm.
      if ! sink_exists "$target_sink"; then
        ${pkgs.pulseaudio}/bin/pactl load-module module-alsa-sink \
          device=${lib.escapeShellArg (toString substrateAudioRoute.pcm)} \
          sink_name="$target_sink" \
          sink_properties=device.description=${lib.escapeShellArg (toString substrateAudioRoute.description)} \
          >/dev/null || {
            echo "korri-sm8550-audio-bootstrap: pactl load-module module-alsa-sink failed" >&2
            exit 1
          }
      fi
      clamp_named_sink "$target_sink"
    ''
    + lib.optionalString (!substrateAudioRouteIsUcm && !substrateAudioRouteIsManual) ''

      # Profiles without a declared route get a best-effort clamp against the
      # current non-null default sink. If only auto_null exists, allow the
      # session to start silent rather than inventing a product-side route.
      clamp_default_sink || exit 0
    ''
    + ''

      # Never boot the handheld at an unsafe speaker level. The product volume
      # buttons adjust the user-session PipeWire/Pulse sink in 5% steps; start
      # from a quiet default so app launches cannot surprise-blast before the
      # operator has interacted with inputd.
      ${pkgs.pulseaudio}/bin/pactl set-sink-volume @DEFAULT_SINK@ ${korriSafeDefaultSinkVolume} >/dev/null 2>&1 || true
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
  handheldRetroArchInputPolicy = {
    drivers = {
      input = "udev";
      joypad = "udev";
    };
    input = {
      autodetect = true;
      maxUsers = 4;
      ports."1" = {
        joypadIndex = 0;
        analogDpadMode = 1;
      };
    };
  };
  # SM8550 platform launch policy is rendered into the readable library
  # cascade. Moonlight uses host.moonlight. YFS carries authored plugin
  # settings and browser display environment on argv because the Remap
  # runner/Bun boundary cannot rely on KORRI_* process env being visible to
  # JavaScript. Device-specific YFS presentation settings belong in device
  # YAML, not in this platform adapter.
  sm8550PlatformDefaults = {
    launchers."@korri:web-canvas/chromium" = {
      command = "korri-web-canvas";
      args = [
        "--settings-json={settings.plugin}"
        "--browser-env=XDG_RUNTIME_DIR=${korriRuntimeDir}"
        "--browser-env=PULSE_SERVER=unix:${korriRuntimeDir}/pulse/native"
        "--browser-env=WAYLAND_DISPLAY=wayland-1"
        "--browser-env=HOME=/tmp"
        "--browser-env=XDG_CACHE_HOME=/tmp/korri-remap-runner-cache"
        "--browser-env=USER=korri-remap-runner"
        "--browser-env=LOGNAME=korri-remap-runner"
        "{target}"
      ];
      systems = [ "web" ];
      env.KORRI_WEB_CANVAS_SETTINGS = "{settings.plugin}";
      policy.allowedCommands = [
        "korri-web-canvas"
        "korri-webpage"
        "chromium"
      ];
      settings.plugin = { };
    };

    launchers."@korri:yoshis-fabrication-station/level" = {
      command = "yfs-launch";
      args = [
        "--settings-json={settings.plugin}"
        "--cache-root=/tmp/korri-remap-runner-yfs-cache"
        "--browser-env=XDG_RUNTIME_DIR=${korriRuntimeDir}"
        "--browser-env=PULSE_SERVER=unix:${korriRuntimeDir}/pulse/native"
        "--browser-env=WAYLAND_DISPLAY=wayland-1"
        "--browser-env=HOME=/tmp"
        "--browser-env=XDG_CACHE_HOME=/tmp/korri-remap-runner-cache"
        "--browser-env=USER=korri-remap-runner"
        "--browser-env=LOGNAME=korri-remap-runner"
        "{content.path}"
      ];
      systems = [ "yfs" ];
      env.KORRI_YFS_SETTINGS = "{settings.plugin}";
      policy.allowedCommands = [
        "yfs-launch"
        "chromium"
      ];
      launch."with"."@korri:remap" = {
        bindings = {
          "p1.dpad.up" = "key.up";
          "p1.dpad.down" = "key.down";
          "p1.dpad.left" = "key.left";
          "p1.dpad.right" = "key.right";
          "p1.stick.left.up" = "key.up";
          "p1.stick.left.down" = "key.down";
          "p1.stick.left.left" = "key.left";
          "p1.stick.left.right" = "key.right";
          "p1.stick.right.up" = "key.up";
          "p1.stick.right.down" = "key.down";
          "p1.stick.right.left" = "key.left";
          "p1.stick.right.right" = "key.right";
          # YFS keyboard defaults: Z=jump, A=tongue, X=throw. On the
          # InputPlumber-normalized Sobo controller observed during smoke,
          # the physical west face button arrives as BTN_NORTH, so keep both
          # north and west on tongue instead of leaving west inert.
          "p1.button.south" = "key.z";
          "p1.button.west" = "key.a";
          "p1.button.east" = "key.x";
          "p1.button.north" = "key.a";
          "p1.button.start" = "key.p";
        };
      };
      settings.plugin = { };
    };

    host.plugin."@korri:retroarch" = handheldRetroArchInputPolicy;

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
    korri.nixosModules.korri-steam
    ../../modules/korri-removable-media.nix
  ];

  assertions = [
    {
      assertion = (gamescopePackage.pname or "") == "gamescope-korri";
      message = "RockNix SM8550 compositors must use the plugin-owned gamescope-korri package.";
    }
    {
      # The plugin-owned package includes the pipewire-loop-lock fix required
      # whenever the substrate-declared video decode backend exercises the
      # v4l2m2m zero-copy import path.
      assertion =
        substrateVideoDecodeBackend != "v4l2m2m"
        || lib.versionAtLeast (lib.getVersion gamescopePackage) "3.16.20";
      message = "RockNix SM8550 compositors require the plugin-owned runtime package at version >= 3.16.20 when the substrate declares video.decodeBackend = v4l2m2m.";
    }
  ];

  services.inputplumber.package = lib.mkForce inputplumberPackage;

  services.udev.extraRules = ''
    # Rootless wlroots compositors acquire DRM through logind/libseat, so the
    # SM8550 KMS card must be attached to seat0. RockNIX guest device events do
    # not currently carry systemd's generic seat tags for this platform node.
    SUBSYSTEM=="drm", KERNEL=="card[0-9]*", TAG+="seat", TAG+="master-of-seat", ENV{ID_SEAT}="seat0"

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

  # Swappable game/content cards are operator media, not durable internal
  # guest storage; the shared removable-media module mounts each visible
  # SD-card filesystem partition by kernel instance and exposes it as a
  # card-wins config root at the fixed cross-device path
  # /run/media/korri/<media-id>. The guest's durable system disk (UFS sda)
  # backs the guest root itself (`/` is a bind of /dev/sda19; /storage is a
  # plain directory inside it, not a mount — validated on bandai 2026-06-11),
  # so the module's default requiredSystemMounts of "/" derives sda into the
  # runtime deny-list before any card mounts (fail-safe).
  services.korri.removableMedia = {
    enable = true;
    contentRoot = "/var/lib/korri/content/removable/cards";
    match = {
      mmc = true;
      usb = false;
    };
  };

  # The guest sees DRM and input devices that already exist in the
  # ROCKNIX-hosted device namespace. Host-bound nodes do not emit a fresh
  # guest `add` event, so the guest udev rules above may never fire for them.
  # Reprocess both subsystems when the guest's sysfs permits it, then apply a
  # direct ACL fallback for DRM/input/tty nodes. Sobo exposes DRM uevent files
  # read-only inside nspawn, so udev re-trigger failure is expected and must
  # not block greetd or the compositor.
  # Running before greetd keeps any successful re-trigger off the live
  # InputPlumber session and ensures wlroots direct-session tty ACLs exist.
  systemd.services.korri-rocknix-seat-device-trigger = {
    description = "Apply Korri RockNIX seat + input udev metadata";
    wantedBy = [ "multi-user.target" ];
    after = [ "systemd-udevd.service" "rocknix-sound-card-udev-hydrate.service" ];
    wants = [ "rocknix-sound-card-udev-hydrate.service" ];
    before = [ "greetd.service" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = korriRocknixSeatDeviceSetup;
      RemainAfterExit = true;
    };
  };

  systemd.services.korri-rocknix-device-acl-fallback = {
    description = "Re-apply Korri SM8550 device ACLs after greetd opens the TTY";
    wantedBy = [ "multi-user.target" ];
    after = [ "greetd.service" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = korriRocknixDeviceAclFallback;
      RemainAfterExit = true;
    };
  };

  # Korri SM8550 runs a real greetd/logind session as the non-root Korri
  # runtime user. Keep audio in that same user session instead of starting the
  # legacy nix-on-rocks root main-space PipeWire graph under /run/user/0.
  # The substrate still supplies the neutral SM8550 audio facts (Pulse API and
  # AYN UCM package), but the product owns where the graph lives.
  services.korri.remap.enable = true;

  services.korri.runtime.extraGroups = [
    "audio"
    "input"
    "render"
    "seat"
    "video"
  ];

  services.korri.steam = {
    enable = true;
    package = korri.packages.${targetSystem}.steam-korri;
    home = "${runtime.stateRoot}/steam";
    gamesRoot = "${runtime.gamesRoot}/steam";
    dotDir = "${runtime.home}/.steam";
    fexRootfs = "${runtime.stateRoot}/steam/fex-rootfs";
    keepWarm = true;
    keepVisibleDuringLaunch = true;
    appAudioSinkName = substrateAudioTargetSink;
  };

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
    after = [
      "pipewire.service"
      "pipewire-pulse.service"
      "wireplumber.service"
    ];
    wants = [
      "pipewire.service"
      "pipewire-pulse.service"
      "wireplumber.service"
    ];
    before = [
      "korri-compositor.service"
      "korri-sessiond.service"
      "korri-inputd.service"
    ];
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

  systemd.user.services.korri-compositor = {
    requires = [ "korri-sm8550-audio-bootstrap.service" ];
    after = [ "korri-sm8550-audio-bootstrap.service" ];
    serviceConfig.UnsetEnvironment = [
      "DISPLAY"
      "WAYLAND_DISPLAY"
    ];
  };

  systemd.user.services.korri-sessiond = {
    requires = [ "korri-sm8550-audio-bootstrap.service" ];
    after = [ "korri-sm8550-audio-bootstrap.service" ];
  };

  systemd.user.services.korri-inputd = {
    requires = [ "korri-sm8550-audio-bootstrap.service" ];
    after = [ "korri-sm8550-audio-bootstrap.service" ];
  };

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
      gamescopePackage
      substratePackages.cemu
      ryubingPackage
      # `pkgs.moonlight-embedded` is globally replaced by
      # `moonlight-embedded-korri` via the Korri package overlay.
      pkgs.moonlight-embedded
    ];

    environment =
      moonlightCompositorEnvironment
      // gamescopeControlEnvironment
      // {
        XDG_CURRENT_DESKTOP = "sway";
        CEMU_BIOS_ROOT = "/storage/roms/bios/cemu";
        CEMU_AFFINITY_MASK = sm8550.performance.cemuAffinityMask;
        WLR_NO_HARDWARE_CURSORS = "1";
        WLR_LIBINPUT_NO_DEVICES = "1";
        # Sobo's host-bound DRM node cannot be attached to logind's seat from
        # inside the guest because the relevant sysfs uevent path is read-only.
        # Use wlroots' direct session path; the setup units above grant the
        # runtime user access to /dev/dri, /dev/input, and the active ttys.
        WLR_SESSION = "direct";
        LIBSEAT_BACKEND = "builtin";
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
    path = [
      gamescopePackage
      box64RuntimePackage
      pkgs.moonlight-embedded
      yfsPackage
      webCanvasPackage
    ];
    extraEnvironment =
      moonlightSessiondEnvironment
      // gamescopeControlEnvironment
      // {
        KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
        # 3dSen's validated Linux path is x86_64 Unity -> Box64 -> native
        # Turnip Vulkan -> Xwayland/Sway. Keep foreground children on the
        # X11 backend by default; hosts whose Sway allocates a non-default
        # Xwayland display can override this unit env without changing app
        # policy or plugin composition.
        DISPLAY = ":0";
        GDK_BACKEND = "x11";
        PULSE_SERVER = korriPulseServer;
      };
  };

  services.korri.daemon.library.platformDefaults = sm8550PlatformDefaults;

  systemd.user.services.korrid.environment = gamescopeControlEnvironment // {
    KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
    KORRI_NIX_COMMAND = "${pkgs.nix}/bin/nix";
    KORRI_PLUGIN_RESOURCE_ROOT = "${runtime.stateRoot}/plugins/resources";
  };

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

  systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkOverride 40 (
    lib.concatStringsSep ":" [
      "${config.services.inputplumber.package}/share"
      "/run/current-system/sw/share"
    ]
  );

  environment.etc."rocknix-stage10-proof-marker".text = ''
    korri-sm8550-kiosk-system
    target=${config.networking.hostName}
  '';

  environment.systemPackages = [
    substratePackages.cemu
    ryubingPackage
    yfsPackage
    webCanvasPackage
  ];
}
