{
  korri,
  nixpkgs,
  nix-on-rocks,
  deviceProfile,
  # DRM/KMS connector name of this device's primary display, declared by the
  # product (Thor -> "DSI-2", Odin 2 Portal -> "DSI-1"). null for the
  # by-compatible image, where it is inferred from the resolved deviceProfile
  # below as a transitional bridge until the substrate exposes a neutral
  # primary-connector fact (Stage 2).
  homeOutput ? null,
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
  inputplumberHelpers = import ../inputplumber-platform-helpers.nix { inherit pkgs; };
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  ryubingPackage = korri.packages.${targetSystem}.ryubing-korri;
  yfsPackage = korri.packages.${targetSystem}.yoshis-fabrication-station;
  webCanvasPackage = korri.packages.${targetSystem}.korri-web-canvas;
  box64RuntimePackage = korri.packages.${targetSystem}.korri-box64-runtime or pkgs.box64;
  gamescopeControlEnvironment = gamescopeNix.controlEnvironment;
<<<<<<< Updated upstream
  enabledFirstPartyPlugins = "@korri:3dsen,@korri:am2rlauncher,@korri:box64-runtime,@korri:dome-romantik,@korri:gamescope,@korri:globeba,@korri:gmloader,@korri:mega-man-rock-n-roll,@korri:moonlight,@korri:neverball,@korri:remap,@korri:retroarch,@korri:ryubing,@korri:shipwright,@korri:smb-wonderland-1987,@korri:sonic-3-air,@korri:sonic-time-twisted,@korri:spelunky-classic-hd,@korri:srb2kart,@korri:stargrove-scramble,@korri:steam,@korri:tiny-crate,@korri:tmnt-rescue-palooza,@korri:turnip,@korri:webpage,@korri:web-canvas,@korri:xjlt,@korri:yoshis-fabrication-station,@korri:zquest-classic";
=======
  enabledFirstPartyPlugins = "@korri:retroarch,@korri:gamescope,@korri:neverball,@korri:ryubing";
>>>>>>> Stashed changes
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
  # Neutral display facts owned by nix-on-rocks (rocknix.device.display.*).
  # Korri renders 100% of the Sway from this hardware data; the substrate
  # never ships compositor syntax. Mirrors how video/audio expose neutral
  # facts (decodeBackend, audio.route) that Korri composes.
  displayFacts = config.rocknix.device.display;
  displayPrimaryConnector = displayFacts.primaryConnector;
  # Non-primary connectors are dual-panel secondaries (e.g. Thor's bottom
  # DSI-1). Single-panel devices (Odin 2 Portal) have none, so bottom-screen
  # device policy must no-op instead of acting on the only display.
  displaySecondaryConnectors = map (o: o.connector) (
    builtins.filter (o: o.connector != displayPrimaryConnector) displayFacts.outputs
  );
  displayBottomConnector =
    if displaySecondaryConnectors == [ ] then null else builtins.head displaySecondaryConnectors;
  renderSwayOutput =
    o:
    lib.concatStringsSep "\n" (
      [
        "output ${o.connector} enable"
        "output ${o.connector} transform ${toString o.transform}"
        "output ${o.connector} pos ${o.position}"
        "output ${o.connector} bg ${o.background}"
      ]
      ++ lib.optional o.allowTearing "output ${o.connector} allow_tearing yes"
      ++ lib.optional (o.maxRenderTime != null) "output ${o.connector} max_render_time ${o.maxRenderTime}"
    );
  renderSwayTouchDevice =
    d:
    lib.concatStringsSep "\n" (
      [ ''input "${d.match}" map_to_output ${d.connector}'' ]
      ++ lib.optional (
        d.calibrationMatrix != null
      ) ''input "${d.match}" calibration_matrix ${d.calibrationMatrix}''
    );
  # Full Sway display fragment rendered from the neutral facts: per-output
  # transform/pos/bg/tearing, the touch default + per-device maps, then
  # power-off for any output declared dark-at-boot (Thor's bottom panel).
  renderSwayDisplay = lib.concatStringsSep "\n" (
    (map renderSwayOutput displayFacts.outputs)
    ++ lib.optional (
      displayFacts.touch.defaultConnector != null
    ) "input type:touch map_to_output ${displayFacts.touch.defaultConnector}"
    ++ (map renderSwayTouchDevice displayFacts.touch.devices)
    ++ (map (o: "output ${o.connector} power off") (
      builtins.filter (o: !o.powerOnBoot) displayFacts.outputs
    ))
  );
  # Single resolved primary-connector value used by every output consumer
  # (compositor lane pin, gamescope preferred output, Steam). The product's
  # explicit homeOutput wins; otherwise it falls back to the neutral primary
  # connector exposed by the substrate's display facts.
  resolvedHomeOutput = if homeOutput != null then homeOutput else displayPrimaryConnector;
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
  substrateAudioSink = sm8550.audio.defaultSink;
  substrateAudioRouteKind = substrateAudioRoute.kind;
  substrateAudioRouteIsUcm = substrateAudioRouteKind == "wireplumber-ucm";
  substrateAudioRouteIsManual = substrateAudioRouteKind == "manual-pcm";
  substrateAudioTargetSink =
    if substrateAudioRouteIsUcm then
      substrateAudioRoute.expectedSink
    else if substrateAudioRouteIsManual then
      substrateAudioRoute.sinkName
    else
      substrateAudioSink.name;
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
  # Bandai bottom-screen keyboard MVP. This remains platform-local: the AYN/F24
  # button dispatches inputd's existing toggle-bottom-screen action, and only
  # this image overrides that action with second-screen policy.
  korriBandaiBottomKeyboardToggle = pkgs.writeShellApplication {
    name = "korri-bandai-bottom-keyboard-toggle";
    runtimeInputs = with pkgs; [
      coreutils
      findutils
      gnugrep
      procps
      sway
      wvkbd
    ];
    text =
      # Bottom-screen keyboard toggle is dual-panel (Thor/Bandai) policy. On
      # single-panel devices there is no secondary connector, so the action
      # must no-op rather than power off the only display.
      if displayBottomConnector == null then
        ''
          set -u
          # Single-panel device: no secondary/bottom screen to toggle.
          exit 0
        ''
      else
        ''
          set -u

          runtime_dir="''${XDG_RUNTIME_DIR:-${korriRuntimeDir}}"
          sock=$(find "$runtime_dir" -maxdepth 1 -name 'sway-ipc.*.sock' -print 2>/dev/null | head -n 1 || true)
          [ -n "$sock" ] || exit 0
          export SWAYSOCK="$sock"

          bottom_is_on() {
            swaymsg -t get_outputs \
              | grep -A30 '"name": "${displayBottomConnector}"' \
              | grep -q '"power": true'
          }

          stop_keyboard() {
            pkill -x wvkbd-mobintl 2>/dev/null || true
            pkill -x wvkbd 2>/dev/null || true
          }

          if bottom_is_on; then
            stop_keyboard
            swaymsg 'focus output ${displayPrimaryConnector}' >/dev/null 2>&1 || true
            swaymsg 'output ${displayBottomConnector} power off' >/dev/null 2>&1 || true
            exit 0
          fi

          swaymsg 'output ${displayBottomConnector} power on' >/dev/null 2>&1 || true
          swaymsg 'focus output ${displayBottomConnector}' >/dev/null 2>&1 || true
          swaymsg 'workspace "korri:bottom-keyboard"' >/dev/null 2>&1 || true

          if ! pgrep -x wvkbd-mobintl >/dev/null 2>&1; then
            wvkbd-mobintl -L 360 --fn 'sans 18' >/tmp/korri-bottom-keyboard.log 2>&1 &
          fi

          sleep 0.2
          swaymsg 'focus output ${displayPrimaryConnector}' >/dev/null 2>&1 || true
        '';
  };
  # The substrate exposes an explicit audio route strategy under
  # rocknix.device.audio.route.*. Korri owns the kiosk user's PipeWire graph,
  # but it still treats the substrate route as the source of truth: product
  # code selects/clamps the declared PulseAudio-compatible sink and does not
  # perform hardware-specific UCM card activation. A missing or renamed card
  # must never prevent the visible kiosk session from starting.
  sm8550AudioBootstrapActions =
    lib.optionals substrateAudioRouteIsUcm [
      {
        kind = "clamp-target-sink";
        onFailure = "continue";
      }
    ]
    ++ lib.optionals substrateAudioRouteIsManual [
      {
        kind = "load-alsa-sink-if-missing";
        pcm = toString substrateAudioRoute.pcm;
        description = toString substrateAudioRoute.description;
        onFailure = "continue";
      }
      {
        kind = "clamp-target-sink";
        onFailure = "continue";
      }
    ]
    ++ lib.optionals (!substrateAudioRouteIsUcm && !substrateAudioRouteIsManual) [
      {
        kind = "clamp-default-sink";
        onFailure = "continue";
      }
    ]
    ++ [
      {
        kind = "clamp-current-default-sink";
        onFailure = "continue";
      }
    ];
  inputplumberPackage =
    pkgs.runCommand "korri-rocknix-inputplumber-xb360"
      {
        meta.mainProgram = "inputplumber";
      }
      ''
        cp -a ${substratePackages.inputplumber} $out
        chmod -R u+w $out
        ${inputplumberHelpers.patchInputplumberXb360Target { targetDeviceYaml = "02-ayn-controller.yaml"; }}
      '';
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

    host.launch."with"."@korri:gamescope" = {
      enable = true;
      display.output.preferredConnectors = [ resolvedHomeOutput ];
    };

    host.moonlight = {
      command = "${pkgs.moonlight-embedded}/bin/moonlight";
      environment = moonlightRuntimeSettingsEnvironment // {
        SDL_AUDIODRIVER = substrateAudioApi;
        SDL_VIDEODRIVER = "wayland";
        XDG_CACHE_HOME = "${runtime.home}/.cache";
      };
      platform.name = substrateVideoDecodeBackend;
      # Default to H.264 so live runtime stream-settings (bitrate/FPS/resolution)
      # are offered on the connection point. The runtime-settings apply path is
      # validated on H.264 VAAPI only; leaving codec at "auto" negotiates H.265,
      # which does not advertise the runtime quality controls.
      stream.codec = "h264";
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
    ../../modules/korri-rocknix-audio-bootstrap.nix
    ../../modules/korri-rocknix-guest-device-access.nix
    ../../modules/korri-rocknix-guest-profile.nix
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

  # Korri owns the product tailnet posture. The SM8550 ROCKNIX substrate
  # currently lacks the MARK/netfilter compatibility modules Tailscale expects
  # for standard firewall mode, so this adapter carries a temporary bridge:
  # keep MagicDNS/product hostname behavior from services.korri.tailnet, but run
  # Tailscale with netfilter management disabled until the substrate exposes
  # xt_mark/xt_MARK/nft_compat/x_tables/iptable_filter/iptable_nat. While this
  # bridge exists, daemon firewall openings stay interface-scoped and this
  # adapter must not advertise subnet routes or exit-node service.
  services.korri.tailnet.enable = lib.mkDefault true;
  services.tailscale = {
    extraUpFlags = [ "--netfilter-mode=off" ];
    extraSetFlags = [ "--netfilter-mode=off" ];
  };
  systemd.services.tailscaled.serviceConfig.AmbientCapabilities = lib.mkAfter [
    "CAP_NET_ADMIN"
    "CAP_NET_RAW"
  ];

  services.korri.rocknixGuestProfile = {
    enable = true;
    proofMarkerLabel = "korri-sm8550-kiosk-system";
  };

  services.korri.rocknixGuestDeviceAccess = {
    enable = true;
    runtimeUser = runtime.user;
    retriggerSubsystems = [
      "drm"
      "input"
      "sound"
      "video4linux"
    ];
    aclNodeGlobs = [
      "/dev/dri/card*"
      "/dev/dri/renderD*"
      "/dev/input/event*"
      "/dev/snd/*"
      "/dev/video*"
      "/dev/tty0"
      "/dev/tty1"
    ];
    udevSettleTimeoutSeconds = 5;
    fallbackDelaySeconds = 2;
    fallbackAttempts = 3;
    fallbackRetryDelaySeconds = 1;
    enableDrmSeatTag = true;
    enableInputUdevAcl = true;
    enableVideoUdevAcl = true;
    enableBacklightRepair = true;
    backlightGroup = "video";
    backlightNodeGlobs = [ "/sys/class/backlight/*/brightness" ];
  };

  services.korri.rocknixAudioBootstrap = {
    enable = true;
    pulseServer = korriPulseServer;
    targetSink = substrateAudioTargetSink;
    safeVolume = "10%";
    serviceScope = "user";
    failOnSocketUnavailable = false;
    actions = sm8550AudioBootstrapActions;
  };

  services.korri.client.package = korri.packages.${targetSystem}.korri-chromium-kiosk;

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

  # The shared guest-device-access module owns the retrigger/ACL scripts and
  # udev rules. SM8550 owns only ordering: run setup before greetd so any
  # successful re-trigger stays off the live InputPlumber session and wlroots
  # direct-session tty ACLs exist. The substrate sound-card hydrate unit remains
  # substrate-owned; this adapter only waits for it before the shared sound
  # retrigger posture runs.
  systemd.services.korri-rocknix-seat-device-trigger = {
    wantedBy = [ "multi-user.target" ];
    after = [
      "systemd-udevd.service"
      "rocknix-sound-card-udev-hydrate.service"
    ];
    wants = [ "rocknix-sound-card-udev-hydrate.service" ];
    before = [ "greetd.service" ];
  };

  systemd.services.korri-rocknix-device-acl-fallback = {
    wantedBy = [ "multi-user.target" ];
    after = [ "greetd.service" ];
  };

  # Korri SM8550 runs a real greetd/logind session as the non-root Korri
  # runtime user. Keep audio in that same user session instead of starting the
  # legacy nix-on-rocks root main-space PipeWire graph under /run/user/0.
  # The substrate still supplies the neutral SM8550 audio facts (Pulse API and
  # AYN UCM package), but the product owns where the graph lives.
  services.korri.remap.enable = true;

  services.korri.scout.releaseScan = {
    enable = true;
    extraEnvironment.KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
  };

  services.korri.runtime.extraGroups = [
    "audio"
    "input"
    "render"
    "seat"
    "video"
    "wheel"
  ];

  # Korri OS is a device-user system, not a root-SSH appliance. Keep remote
  # access key-only, enter through the Korri runtime user, and use sudo for
  # administrative work. During migration, preserve existing root SSH public
  # keys by merging them into the runtime user's authorized_keys before root
  # SSH is disabled. This does not delete or modify root's key files.
  system.activationScripts.korriSshAuthorizedKeysMigration = {
    deps = [ "users" ];
    text = ''
      if [ -s /root/.ssh/authorized_keys ]; then
        runtime_home=${runtime.home}
        ssh_dir="$runtime_home/.ssh"
        auth_keys="$ssh_dir/authorized_keys"
        tmp="$(${pkgs.coreutils}/bin/mktemp)"

        ${pkgs.coreutils}/bin/install -d -m 700 -o ${runtime.user} -g ${runtime.group} "$ssh_dir"
        ${pkgs.coreutils}/bin/cat "$auth_keys" 2>/dev/null > "$tmp" || true
        ${pkgs.coreutils}/bin/cat /root/.ssh/authorized_keys >> "$tmp"
        ${pkgs.coreutils}/bin/sort -u "$tmp" > "$auth_keys"
        ${pkgs.coreutils}/bin/rm -f "$tmp"
        ${pkgs.coreutils}/bin/chown ${runtime.user}:${runtime.group} "$auth_keys"
        ${pkgs.coreutils}/bin/chmod 600 "$auth_keys"
      fi
    '';
  };

  services.openssh.settings = {
    PasswordAuthentication = false;
    KbdInteractiveAuthentication = false;
    PermitRootLogin = lib.mkForce "no";
  };

  security.sudo.extraRules = [
    {
      users = [ runtime.user ];
      commands = [
        {
          command = "ALL";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];

  # Non-root deploys. Root SSH is disabled above and root's authorized_keys are
  # migrated onto the runtime user, so nixos-rebuild connects as ${runtime.user}
  # and activates via that user's NOPASSWD sudo (--use-remote-sudo). For the
  # closure-copy step to accept unsigned paths built on the remote build host,
  # the deploy user must be a trusted Nix user; otherwise `nix copy` rejects
  # them with "cannot add path ... untrusted".
  nix.settings.trusted-users = [ "root" runtime.user ];

  services.korri.steam = {
    enable = true;
    package = korri.packages.${targetSystem}.steam-korri;
    home = "${runtime.stateRoot}/steam";
    gamesRoot = "${runtime.gamesRoot}/steam";
    dotDir = "${runtime.home}/.steam";
    fexRootfs = "${runtime.stateRoot}/steam/fex-rootfs";
    betaChannel = "steamdeck_stable";
    keepWarm = true;
    keepVisibleDuringLaunch = true;
    gamescopePreferOutput = resolvedHomeOutput;
    # Steam's Gamepad UI can grab controller focus from the foreground AppID
    # game; keep Steam in the gamescoped service, but launch the desktop client
    # without -gamepadui so control stays with the game window.
    useGamepadUi = false;
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

  systemd.user.services.korri-rocknix-audio-bootstrap = {
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
    environment.ALSA_CONFIG_UCM2 = substrateAudioUcmPath;
  };

  systemd.user.services.korri-compositor = {
    after = [ "korri-rocknix-audio-bootstrap.service" ];
    serviceConfig.UnsetEnvironment = [
      "DISPLAY"
      "WAYLAND_DISPLAY"
    ];
  };

  systemd.user.services.korri-sessiond = {
    after = [ "korri-rocknix-audio-bootstrap.service" ];
  };

  systemd.user.services.korri-inputd = {
    after = [ "korri-rocknix-audio-bootstrap.service" ];
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

    # Seat/session backend for wlroots. "direct" is the legacy ROCKNIX-guest
    # workaround (builtin libseat opens VT/DRM/input via the runtime user's
    # ACLs). Flip to "logind" to let libseat acquire the guest's
    # systemd-logind seat0; validate on a clean guest reboot.
    seatBackend = "logind";

    # Primary display connector (neutral KMS fact). The compositor module pins
    # the hub/game lane workspaces to this output so the main panel boots
    # straight into the hub instead of an empty auto-numbered workspace.
    homeOutput = resolvedHomeOutput;

    environment =
      moonlightCompositorEnvironment
      // gamescopeControlEnvironment
      // {
        XDG_CURRENT_DESKTOP = "sway";
        CEMU_BIOS_ROOT = "/storage/roms/bios/cemu";
        CEMU_AFFINITY_MASK = sm8550.performance.cemuAffinityMask;
        WLR_NO_HARDWARE_CURSORS = "1";
        USER = runtime.user;
      };

    # Korri renders the entire display fragment from the substrate's neutral
    # display facts. Per-output transform/power derives from the facts, so
    # single-panel devices (Odin 2 Portal) keep their validated transform and
    # never power off their only display, while Thor's bottom DSI-1 is
    # configured then powered off at boot (powerOnBoot = false).
    sway.extraConfig = ''
      # ROCKNIX SM8550 display/session fragment rendered by Korri from the
      # substrate's neutral display facts (rocknix.device.display.*).
      seat * hide_cursor 1000
      default_border none

      ${renderSwayDisplay}
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
  #   - AYN/F24 -> bottom-screen toggle. This is SM8550/Bandai-specific device
  #     policy and intentionally not part of standard controller Home handling.
  services.korri.input.inputd.environment = {
    KORRI_INPUTD_KEY_F24_ACTION = "toggle-bottom-screen";
    KORRI_INPUTD_TOGGLE_BOTTOM_SCREEN = "${korriBandaiBottomKeyboardToggle}/bin/korri-bandai-bottom-keyboard-toggle";
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

  systemd.services.inputplumber.environment.XDG_DATA_DIRS = lib.mkOverride 40 (
    lib.concatStringsSep ":" [
      "${config.services.inputplumber.package}/share"
      "/run/current-system/sw/share"
    ]
  );

  environment.systemPackages = [
    substratePackages.cemu
    ryubingPackage
    yfsPackage
    webCanvasPackage
  ];
}
