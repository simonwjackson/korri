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
  korriSm8550AudioBootstrap = pkgs.writeShellScript "korri-sm8550-audio-bootstrap" ''
    set -u

    preferred_card="alsa_card.platform-sound"
    preferred_profile=${lib.escapeShellArg "${substrateAudioSink.ucmVerb} (Headphones, ${substrateAudioSink.ucmDevice})"}
    preferred_sink="alsa_output.platform-sound.${substrateAudioSink.ucmVerb}__${substrateAudioSink.ucmDevice}__sink"
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

    if ${pkgs.pulseaudio}/bin/pactl list cards | ${pkgs.gnugrep}/bin/grep -Fq "$preferred_profile"; then
      ${pkgs.pulseaudio}/bin/pactl set-card-profile "$preferred_card" "$preferred_profile" >/dev/null 2>&1 || true
      if ${pkgs.pulseaudio}/bin/pactl list short sinks | ${pkgs.gnugrep}/bin/grep -q "^.*[[:space:]]$preferred_sink[[:space:]]"; then
        ${pkgs.pulseaudio}/bin/pactl set-default-sink "$preferred_sink" >/dev/null 2>&1 || true
        exit 0
      fi
    fi

    # Fallback for kernels/profiles where WirePlumber exposes only Pro Audio:
    # create the substrate-declared PCM sink directly and make it default.
    if ! ${pkgs.pulseaudio}/bin/pactl list short sinks | ${pkgs.gnugrep}/bin/grep -q "^[0-9][0-9]*[[:space:]]$fallback_sink[[:space:]]"; then
      ${pkgs.pulseaudio}/bin/pactl load-module module-alsa-sink \
        device=${lib.escapeShellArg substrateAudioSink.pcm} \
        sink_name="$fallback_sink" \
        sink_properties=device.description=${lib.escapeShellArg substrateAudioSink.description} \
        >/dev/null 2>&1 || true
    fi

    ${pkgs.pulseaudio}/bin/pactl set-default-sink "$fallback_sink" >/dev/null 2>&1 || true
  '';
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

    # Korri inputd runs as the kiosk user and reads evdev directly before
    # forwarding controller events to the desktop renderer. On the RockNIX
    # SM8550 substrate these event nodes can inherit a numeric group that does
    # not match the NixOS input group, so restate the product image invariant
    # explicitly instead of relying on substrate group ids.
    SUBSYSTEM=="input", KERNEL=="event*", GROUP="input", MODE="0660", TAG+="uaccess"
  '';

  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

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

  # The nix-on-rocks SM8550 substrate's main-space-hardware-button-handler is
  # the single owner of bare hardware button semantics that must survive product
  # runtime failures: power/lid fake-suspend and volume/audio policy. Korri
  # inputd still watches the same evdev devices for product shortcuts (for
  # example Home+Volume -> brightness), but must not also translate bare
  # KEY_POWER/SW_LID into the generic `systemctl suspend` fallback or bare
  # volume buttons into a second audio change.
  services.korri.input.inputd.environment = {
    KORRI_INPUTD_POWER_SUSPEND = "true";
    KORRI_INPUTD_LID_CLOSED = "true";
    KORRI_INPUTD_LID_OPENED = "true";
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
