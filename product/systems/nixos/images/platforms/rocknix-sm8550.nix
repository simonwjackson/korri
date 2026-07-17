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
  melonDsPackage = korri.packages.${targetSystem}.melonds or pkgs.melonDS;
  melonDsPresenterPackage = korri.packages.${targetSystem}."melonds-presenter";
  box64RuntimePackage = korri.packages.${targetSystem}.korri-box64-runtime or pkgs.box64;
  gamescopeControlEnvironment = gamescopeNix.controlEnvironment;
  enabledFirstPartyPlugins = "@korri:3dsen,@korri:am2rlauncher,@korri:box64-runtime,@korri:dome-romantik,@korri:gamescope,@korri:globeba,@korri:gmloader,@korri:mega-man-rock-n-roll,@korri:melonds,@korri:moonlight,@korri:neverball,@korri:pico8,@korri:remap,@korri:retroarch,@korri:ryubing,@korri:shipwright,@korri:smb-wonderland-1987,@korri:sonic-3-air,@korri:sonic-time-twisted,@korri:spelunky-classic-hd,@korri:srb2kart,@korri:stargrove-scramble,@korri:steam,@korri:tiny-crate,@korri:tmnt-rescue-palooza,@korri:turnip,@korri:webpage,@korri:web-canvas,@korri:xjlt,@korri:yoshis-fabrication-station,@korri:zquest-classic";
  moonlightRuntimeSettingsEnvironment = {
    # Runtime stream-quality policy is owned by Korri's stream-control surface.
    # Keep the downstream Moonlight spike hooks disabled in product images: the
    # one-shot MVP hook can overwrite live bitrate/FPS/resolution shortly after
    # launch, and the native spike adapter can race Korri's adaptive controller.
    # The proof-gated escape hatch remains while the runtime-settings protocol
    # still advertises some operations as proof gated on current Sunshine builds.
    MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED = "1";
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
  outputPowerOnBoot =
    connector:
    let
      matches = builtins.filter (o: o.connector == connector) displayFacts.outputs;
    in
    if matches == [ ] then true else (builtins.head matches).powerOnBoot;
  bottomTouchMatches =
    if displayBottomConnector == null then
      [ ]
    else
      map (d: d.match) (builtins.filter (d: d.connector == displayBottomConnector) displayFacts.touch.devices);
  renderSwayTouchInitialState =
    d: lib.optionalString (!outputPowerOnBoot d.connector) ''input "${d.match}" events disabled'';
  renderBottomTouchEvents =
    state:
    lib.concatMapStringsSep "\n" (
      match: ''swaymsg 'input "${match}" events ${state}' >/dev/null 2>&1 || true''
    ) bottomTouchMatches;
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
    ++ (map renderSwayTouchInitialState displayFacts.touch.devices)
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
  powerResultDir = "${config.rocknix.power.runtimeDir}/status";
  fakeSuspendActiveMarker = "%t/korri-fakesuspend/active";
  # korri-fakesuspend-toggle -- product fake-suspend policy. Runs as the
  # Korri runtime user (dispatched by inputd) and owns the session/display half
  # of fake suspend. The substrate verb owns radios + governors + NM recovery;
  # this package only drops enter/exit request markers into the neutral channel.
  korriFakesuspendToggle = korri.packages.${targetSystem}.korri-fakesuspend-toggle;
  # Bandai bottom-screen toggle. Thor's bottom-screen hardware button emits
  # KEY_F24 and owns only the DSI-1 power/touch state; keyboard visibility is
  # intentionally handled by Android Back below.
  korriBandaiBottomScreenToggle =
    if displayBottomConnector == null then
      null
    else
      pkgs.writeShellApplication {
        name = "korri-bandai-bottom-screen-toggle";
        runtimeInputs = with pkgs; [
          coreutils
          findutils
          gnugrep
          sway
        ];
        text = ''
      set -u

      runtime_dir="''${XDG_RUNTIME_DIR:-${korriRuntimeDir}}"
      find_sway_sock() {
        if [ -n "''${SWAYSOCK:-}" ] && [ -S "$SWAYSOCK" ]; then
          printf '%s\n' "$SWAYSOCK"
          return 0
        fi
        if [ -S "$runtime_dir/sway-ipc.sock" ]; then
          printf '%s\n' "$runtime_dir/sway-ipc.sock"
          return 0
        fi
        find "$runtime_dir" -maxdepth 1 -type s -name 'sway-ipc.*.sock' -print -quit 2>/dev/null || true
      }
      sock=$(find_sway_sock | head -n 1)
      [ -n "$sock" ] || exit 0
      export SWAYSOCK="$sock"

      bottom_is_on() {
        swaymsg -t get_outputs \
          | grep -A30 '"name": "${displayBottomConnector}"' \
          | grep -q '"power": true'
      }

      if bottom_is_on; then
        swaymsg 'focus output ${displayPrimaryConnector}' >/dev/null 2>&1 || true
        ${renderBottomTouchEvents "disabled"}
        swaymsg 'output ${displayBottomConnector} power off' >/dev/null 2>&1 || true
        exit 0
      fi

      swaymsg 'output ${displayBottomConnector} power on' >/dev/null 2>&1 || true
      ${renderBottomTouchEvents "enabled"}
      swaymsg 'focus output ${displayPrimaryConnector}' >/dev/null 2>&1 || true
    '';
      };
  # Bandai keyboard toggle. wvkbd opens on whatever output Sway currently
  # reports as the bottom-most *active* screen (largest bottom edge), so the
  # keyboard follows the physically lower panel instead of being pinned to a
  # fixed connector or the focused workspace.
  korriBandaiKeyboardHeight = 560;
  korriBandaiKeyboardToggle = pkgs.writeShellApplication {
    name = "korri-bandai-keyboard-toggle";
    runtimeInputs = with pkgs; [
      coreutils
      findutils
      jq
      procps
      sway
      wvkbd
    ];
    text = ''
      set -u

      if pgrep -x wvkbd-mobintl >/dev/null 2>&1 || pgrep -x wvkbd >/dev/null 2>&1; then
        pkill -x wvkbd-mobintl 2>/dev/null || true
        pkill -x wvkbd 2>/dev/null || true
        exit 0
      fi

      runtime_dir="''${XDG_RUNTIME_DIR:-${korriRuntimeDir}}"
      find_sway_sock() {
        if [ -n "''${SWAYSOCK:-}" ] && [ -S "$SWAYSOCK" ]; then
          printf '%s\n' "$SWAYSOCK"
          return 0
        fi
        if [ -S "$runtime_dir/sway-ipc.sock" ]; then
          printf '%s\n' "$runtime_dir/sway-ipc.sock"
          return 0
        fi
        find "$runtime_dir" -maxdepth 1 -type s -name 'sway-ipc.*.sock' -print -quit 2>/dev/null || true
      }
      sock=$(find_sway_sock | head -n 1)
      if [ -n "$sock" ]; then
        export SWAYSOCK="$sock"
        # Pick the powered-on output whose bottom edge sits lowest on screen.
        # Only outputs that are actually lit (power true) are eligible so the
        # keyboard never lands on a blanked panel like a dark bottom screen.
        bottom_output=$(
          swaymsg -t get_outputs -r 2>/dev/null \
            | jq -r '[.[] | select(.active == true and .power == true)] | sort_by(.rect.y + .rect.height) | last | .name // empty' 2>/dev/null || true
        )
        if [ -n "$bottom_output" ]; then
          swaymsg "focus output $bottom_output" >/dev/null 2>&1 || true
        fi
      fi

      wvkbd-mobintl -L ${toString korriBandaiKeyboardHeight} -H ${toString korriBandaiKeyboardHeight} --fn 'sans 18' >/tmp/korri-keyboard.log 2>&1 &
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
  sm8550DualPanelPlatformDefaults = lib.optionalAttrs (displayBottomConnector != null) {
    # Keep this as a complete launcher-shaped overlay rather than a tiny
    # geometry fragment. Current readable launcher merging treats this layer as
    # the launch-policy participant for `launch.with`; omitting the canonical
    # command/args/systems/policy here risks resolving the matched path as a
    # generic process launcher instead of preserving the melonDS materializer.
    launchers."@korri:melonds/matched-dual-screen" = {
      command = "/run/current-system/sw/bin/melonDS";
      args = [ "{content.path}" ];
      systems = [ "nds" ];
      env = {
        WAYLAND_DISPLAY = "wayland-1";
        QT_QPA_PLATFORM = "wayland";
      };
      launch."with"."@korri:gamescope".enable = false;
      settings.plugin = {
        state.root = "{storage:@korri:melonds/state}";
        boot.direct = true;
        display.mode = "dual-window";
        presentation = {
          intent = "matched-dual-screen";
          menu.hide = true;
          input.profile = "inputplumber-xbox";
          wayland = {
            display = "wayland-1";
            compositorSocket = "${korriRuntimeDir}/sway-ipc.sock";
          };
          secondaryOutput = {
            output = displayBottomConnector;
            restore = "observed";
          };
          windows = {
            top = {
              output = resolvedHomeOutput;
              x = 407;
              y = 250;
              width = 1106;
              height = 830;
            };
            bottom = {
              output = displayBottomConnector;
              x = 0;
              y = 0;
              width = 1240;
              height = 930;
            };
          };
        };
      };
      policy.allowedCommands = [ "/run/current-system/sw/bin/melonDS" ];
    };
  };
  # SM8550 platform launch policy is rendered into the readable library
  # cascade. Moonlight uses host.moonlight. YFS carries authored plugin
  # settings and browser display environment on argv because the Remap
  # runner/Bun boundary cannot rely on KORRI_* process env being visible to
  # JavaScript. Device-specific YFS presentation settings belong in device
  # YAML, not in this platform adapter.
  sm8550PlatformDefaults = lib.recursiveUpdate {
    storage."@korri:steam/installed-manifests" = {
      root = "${runtime.stateRoot}/steam/steamapps";
      path."scan.max-depth" = "1";
    };

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
      # Moonlight runs inside Gamescope on SM8550. Touch must pass through to
      # Moonlight so the live touch-bounds coordinator can own host mapping.
      input.defaultTouchMode = 4;
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
      # which does not advertise the runtime quality controls. Keep quality
      # ranges in this unified Moonlight stream policy: scalars pin levers,
      # ranges provide Korri adaptive bounds while start is the Moonlight argv
      # launch value.
      stream = {
        codec = "h264";
        resolution = {
          min = {
            width = 640;
            height = 360;
          };
          start = {
            width = 1280;
            height = 720;
          };
          max = {
            width = 1920;
            height = 1080;
          };
        };
        fps = 120;
        bitrateKbps = {
          min = 500;
          start = 6000;
          max = 40000;
        };
      };
      input = {
        mappingFile = "${pkgs.moonlight-embedded}/share/moonlight/korri-inputplumber-gamecontrollerdb.txt";
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
  } sm8550DualPanelPlatformDefaults;
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
    ../../modules/korri-auto-timezone.nix
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
  # Closed-loop fan control (module arrives via the korri aggregate). The
  # stock SM8550 thermal policy maps max cooling to a quiet pwm 70/255 and
  # lets gaming loads reach ~90C; this curve follows public Thor guidance.
  # Hardware identities verified on Thor/Bandai: fan hwmon name `pwmfan`
  # (tach present), prime-core zone `cpu7-top-thermal` as the temp source.
  # Devices without a `pwmfan` hwmon (if any SM8550 variant lacks one)
  # no-op cleanly at runtime.
  services.korri.fanControl = {
    enable = lib.mkDefault true;
    hwmonName = "pwmfan";
    tempSource = {
      kind = "thermal-zone";
      zoneType = "cpu7-top-thermal";
    };
    # Whisper posture: silent for as long as possible, then ramp hard.
    # Measured on Thor/Bandai: the fan spins reliably down to 8% (pwm 20,
    # ~950 RPM, near-inaudible), stalls below ~6%, and restarts from a dead
    # stop on an 8% command — so the 0% idle floor is safe (the loop's 5s
    # re-write doubles as the restart kick). Underclocked gaming (~53-58C)
    # runs with the fan off or whispering; from 70C up the protection is
    # identical to the earlier gaming curve (70C => 55%, 85C => 100%).
    curve = [
      {
        tempC = 58;
        pwmPercent = 8;
      }
      {
        tempC = 70;
        pwmPercent = 55;
      }
      {
        tempC = 85;
        pwmPercent = 100;
      }
    ];
    # Fan fully off below 58C — measured: underclocked gaming holds ~53-58C
    # even with the fan stopped; the 8% knee catches it as soon as it drifts.
    idlePwmPercent = 0;
    profileName = "thor-whisper";
  };

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

  # Boot-time Scout release scans can recursively walk large removable or
  # mutable game-library roots on Bandai, blocking `nixos-rebuild switch` and
  # consuming multiple GiB of memory. Keep discovery operator/user initiated
  # until the scan path is bounded enough for boot/deploy activation.
  services.korri.scout.releaseScan.enable = false;

  services.korri.input.inputSeat = {
    enable = true;
    user = runtime.user;
    group = "uinput";
    runtimeDir = "%t/korri/input-seat";
  };

  services.korri.runtime.extraGroups = [
    "audio"
    "input"
    "render"
    "seat"
    "uinput"
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
  nix.settings.trusted-users = [
    "root"
    runtime.user
  ];

  services.korri.steam = {
    enable = true;
    package = korri.packages.${targetSystem}.steam-korri;
    home = "${runtime.stateRoot}/steam";
    gamesRoot = "${runtime.gamesRoot}/steam";
    dotDir = "${runtime.home}/.steam";
    fexRootfs = "${runtime.stateRoot}/steam/fex-rootfs";
    betaChannel = "steamdeck_stable";
    # Do not keep desktop Steam resident after boot on SM8550. Even in desktop
    # UI (`uimode=7`), a warm Steam client can retain access to controller
    # Guide/Home input through the normal Korri user seat. AppID launches still
    # cold-start the managed Gamescope service on demand, then stop it on exit.
    keepWarm = false;
    keepVisibleDuringLaunch = true;
    # Bandai must keep Steam contained by Gamescope. Desktop-vs-Gamepad here is
    # a Steam UI persona choice, not permission to run Steam as a naked Sway
    # client: useGamepadUi=false keeps steamwebhelper in desktop UI while
    # presentationMode=gamescope preserves controller/display ownership.
    presentationMode = "gamescope";
    gamescopePreferOutput = resolvedHomeOutput;
    # Steam's Gamepad UI can grab controller focus from the foreground AppID
    # game; keep the warm client in desktop UI without -gamepadui.
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
      workspace korri:steam-debug output ${resolvedHomeOutput}
      # Managed Steam is always isolated from the Korri hub. Gamescope is the
      # owned presentation container; Steam/Xwayland criteria are safety nets
      # for updater/login helper windows that may map outside the nested server.
      for_window [class="gamescope"] move container to workspace korri:steam-debug, fullscreen enable, border none
      for_window [app_id="gamescope"] move container to workspace korri:steam-debug, fullscreen enable, border none
      for_window [class="steam"] move container to workspace korri:steam-debug
      for_window [app_id="steam"] move container to workspace korri:steam-debug

      # Pin the Korri kiosk web surface (Chromium app window) to the hub
      # workspace, which is bound to the primary/top output. Without this the
      # renderer can map onto whatever workspace/output Sway last focused
      # (e.g. the bottom panel).
      for_window [app_id="^chrome-127\.0\.0\.1__.*"] move container to workspace korri:hub

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
  # coordinates sessiond before asking the substrate to drop the radios.
  #   - power button  -> toggle (debounced suspend/resume)
  #   - lid close/open -> explicit suspend/resume edges
  #   - volume up/down -> inputd's built-in `pactl set-sink-volume` default
  #     (PULSE_SERVER below points it at the Korri user-session graph); no
  #     override needed now that the substrate volume handler is gone.
  #   - KEY_F24 -> bottom-screen power/touch toggle only; no keyboard side effect.
  #   - Back -> keyboard toggle. The Android Back key is the hardware gesture for
  #     the active-workspace on-screen keyboard on Bandai.
  services.korri.input.inputd.environment = lib.optionalAttrs (displayBottomConnector != null) {
    KORRI_INPUTD_KEY_F24_ACTION = "toggle-bottom-screen";
    KORRI_INPUTD_TOGGLE_BOTTOM_SCREEN = "${korriBandaiBottomScreenToggle}/bin/korri-bandai-bottom-screen-toggle";
  } // {
    KORRI_INPUTD_BOTTOM_KEYBOARD = "${korriBandaiKeyboardToggle}/bin/korri-bandai-keyboard-toggle";
    KORRI_INPUTD_POWER_SUSPEND = "${korriFakesuspendToggle}/bin/korri-fakesuspend-toggle";
    KORRI_INPUTD_LID_CLOSED = "${korriFakesuspendToggle}/bin/korri-fakesuspend-toggle suspend";
    KORRI_INPUTD_LID_OPENED = "${korriFakesuspendToggle}/bin/korri-fakesuspend-toggle resume";
    KORRI_FAKESUSPEND_REQUEST_DIR = powerRequestDir;
    KORRI_FAKESUSPEND_RESULT_DIR = powerResultDir;
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
      melonDsPackage
      melonDsPresenterPackage
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
        KORRI_FAKESUSPEND_ACTIVE_MARKER = fakeSuspendActiveMarker;
        # Enable Korri-owned adaptive stream quality on SM8550: launch defaults
        # and bounds come from host.moonlight.stream above.
        KORRI_STREAM_ADAPTIVE_ENABLED = "1";
        KORRI_STREAM_ADAPTIVE_OBJECTIVE_BIAS = "0.5";
        KORRI_STREAM_ADAPTIVE_TICK_MS = "5000";
        KORRI_STREAM_OUTAGE_SUPERVISOR_ENABLED = "1";
        KORRI_STREAM_OUTAGE_TICK_MS = "1000";
        KORRI_STREAM_OUTAGE_LOSS_AFTER_MS = "2000";
        KORRI_STREAM_SURFACE_APP_IDS = "gamescope";
      };
  };

  services.korri.daemon = {
    streamControl.enable = true;
    library.platformDefaults = sm8550PlatformDefaults;
  };

  systemd.user.services.korrid.environment = gamescopeControlEnvironment // {
    KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
    KORRI_NIX_COMMAND = "${pkgs.nix}/bin/nix";
    KORRI_PLUGIN_RESOURCE_ROOT = "${runtime.stateRoot}/plugins/resources";
    # The daemon owns remote-source Moonlight runtime supervision after it
    # dispatches the sessiond launch, so it needs the same adaptive feature
    # gate values as sessiond-spawned foreground children.
    KORRI_STREAM_ADAPTIVE_ENABLED = "1";
    KORRI_STREAM_ADAPTIVE_OBJECTIVE_BIAS = "0.5";
    KORRI_STREAM_ADAPTIVE_TICK_MS = "5000";
    KORRI_STREAM_OUTAGE_SUPERVISOR_ENABLED = "1";
    KORRI_STREAM_OUTAGE_TICK_MS = "1000";
    KORRI_STREAM_OUTAGE_LOSS_AFTER_MS = "2000";
    KORRI_STREAM_SURFACE_APP_IDS = "gamescope";
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
