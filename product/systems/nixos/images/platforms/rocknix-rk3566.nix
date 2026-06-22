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
  inputplumberPackage = substratePackages.inputplumber;
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  gamescopeRuntimeEnvironment = gamescopeNix.rk3566RuntimeEnvironment;
  enabledFirstPartyPlugins = "@korri:gamescope,@korri:neverball";
  runtime = config.services.korri.runtime;
  rk3566RuntimeDir = "/run/user/${toString runtime.uid}";
  rk3566PulseServer = "unix:${rk3566RuntimeDir}/pulse/native";
  rk3566SafeDefaultSinkVolume = "10%";
  rk3566TargetSink = config.rocknix.device.audio.defaultSink.name;
  korriRk3566AudioBootstrap = pkgs.writeShellScript "korri-rk3566-audio-bootstrap" ''
    set -u

    safe_default_sink_volume=${lib.escapeShellArg rk3566SafeDefaultSinkVolume}
    target_sink=${lib.escapeShellArg rk3566TargetSink}

    for _ in $(${pkgs.coreutils}/bin/seq 1 60); do
      if ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
        break
      fi
      ${pkgs.coreutils}/bin/sleep 0.5
    done

    if ! ${pkgs.pulseaudio}/bin/pactl info >/dev/null 2>&1; then
      echo "korri-rk3566-audio-bootstrap: PulseAudio socket unavailable at $PULSE_SERVER" >&2
      exit 1
    fi

    for _ in $(${pkgs.coreutils}/bin/seq 1 40); do
      if ${pkgs.pulseaudio}/bin/pactl list short sinks | ${pkgs.gnugrep}/bin/grep -q "^[0-9][0-9]*[[:space:]]$target_sink[[:space:]]"; then
        if ${pkgs.pulseaudio}/bin/pactl set-default-sink "$target_sink" >/dev/null 2>&1 \
          && ${pkgs.pulseaudio}/bin/pactl set-sink-volume "$target_sink" "$safe_default_sink_volume" >/dev/null 2>&1; then
          exit 0
        fi
      fi
      ${pkgs.coreutils}/bin/sleep 0.25
    done

    echo "korri-rk3566-audio-bootstrap: target sink $target_sink unavailable for safe volume clamp" >&2
    exit 1
  '';

  panfrostEnvironment = {
    # RG353M/RK3566 exposes rockchip KMS on card0 and Mali-G52/Panfrost on the
    # render node. wlroots needs both explicitly in the current guest bring-up:
    # KMS on card0, rendering on renderD128. Do not force Mesa's loader/Gallium
    # driver here: the Rockchip KMS node needs Mesa's kmsro path for GBM, while
    # the render node autodetects Panfrost.
    WLR_DRM_DEVICES = "/dev/dri/card0";
    WLR_RENDER_DRM_DEVICE = "/dev/dri/renderD128";
    WLR_RENDERER = "gles2";
    WLR_NO_HARDWARE_CURSORS = "1";
    WLR_LIBINPUT_NO_DEVICES = "1";
    XDG_CURRENT_DESKTOP = "sway";
    XDG_CACHE_HOME = "/home/korri/.cache";
    USER = "korri";
  };

in
{
  imports = [
    nix-on-rocks.nixosModules.rocknix-guest-base
    nix-on-rocks.nixosModules.rk3566
    deviceProfile
  ];

  services.inputplumber.package = lib.mkForce inputplumberPackage;
  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

  # RK3566 keeps the substrate's root-owned main-space PipeWire services, but
  # runs their socket in the Korri runtime user's logind directory so Korri's
  # user services and foreground launches can reach the graph they control.
  # Disable the default per-user PipeWire graph: if it owns the same runtime
  # sockets first, the root main-space graph retry-loops and the safe-audio boot
  # gate cannot complete.
  rocknix.session.runtimeDir.uid = runtime.uid;
  systemd.user.services.pipewire.enable = lib.mkForce false;
  systemd.user.services.pipewire-pulse.enable = lib.mkForce false;
  systemd.user.services.wireplumber.enable = lib.mkForce false;
  systemd.user.sockets.pipewire.enable = lib.mkForce false;
  systemd.user.sockets.pipewire-pulse.enable = lib.mkForce false;

  services.korri.compositor = {
    user = lib.mkDefault "root";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/home/korri";
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
      pkgs.moonlight-embedded
    ];

    environment = panfrostEnvironment;

    sway.extraConfig = ''
      # ROCKNIX RK3566/RG353M kiosk fragment supplied by Korri.
      seat * hide_cursor 1000
      default_border none
      default_floating_border none
      hide_edge_borders both
      gaps inner 0
      gaps outer 0
      output * bg #000000 solid_color
    '';
  };

  services.korri.input.provider = {
    enable = lib.mkDefault true;
    name = lib.mkDefault "inputplumber";
    services = lib.mkDefault [ "inputplumber.service" ];
  };

  services.korri.input.inputd.environment = {
    PULSE_SERVER = rk3566PulseServer;
  };

  services.korri.sessiond = {
    path = [
      gamescopePackage
      pkgs.moonlight-embedded
    ];
    # The plugin-owned foreground runtime inherits this env, so the PanVK
    # runtime knobs must live here alongside the Panfrost ones.
    extraEnvironment =
      panfrostEnvironment
      // gamescopeRuntimeEnvironment
      // {
        KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;
        PULSE_SERVER = rk3566PulseServer;
      };
  };

  # RK3566/PanVK RetroArch is the known deadlock case, but platform defaults
  # must not define an apps.retroarch record because user-authored app records
  # would collide in ProseQL. Apply the Xwayland route at the host layer; more
  # specific app/library policy can opt back in later if a native-Wayland app is
  # proven safe on this platform.
  services.korri.daemon.library.platformDefaults.host.gamescope.app.environment.WAYLAND_DISPLAY =
    null;

  systemd.user.services.korrid.environment.KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;

  systemd.services.korri-rk3566-audio-bootstrap = {
    description = "Clamp RG353M main-space audio to a safe default volume";
    wantedBy = [ "multi-user.target" ];
    after = [
      "main-space-runtime-dir.service"
      "main-space-session-dbus.service"
      "main-space-pipewire.service"
      "main-space-pipewire-pulse.service"
      "main-space-wireplumber.service"
      "main-space-audio-sink-bootstrap.service"
    ];
    wants = [
      "main-space-pipewire.service"
      "main-space-pipewire-pulse.service"
      "main-space-wireplumber.service"
      "main-space-audio-sink-bootstrap.service"
    ];
    requires = [
      "main-space-audio-sink-bootstrap.service"
    ];
    before = [ "greetd.service" ];
    environment = {
      XDG_RUNTIME_DIR = rk3566RuntimeDir;
      DBUS_SESSION_BUS_ADDRESS = "unix:path=${rk3566RuntimeDir}/bus";
      PIPEWIRE_RUNTIME_DIR = rk3566RuntimeDir;
      PULSE_SERVER = rk3566PulseServer;
    };
    serviceConfig = {
      Type = "oneshot";
      User = "root";
      ExecStart = korriRk3566AudioBootstrap;
      RemainAfterExit = true;
    };
  };

  systemd.services.greetd = {
    requires = [ "korri-rk3566-audio-bootstrap.service" ];
    after = [ "korri-rk3566-audio-bootstrap.service" ];
  };

  systemd.user.services.korri-compositor.serviceConfig.UnsetEnvironment = [
    "DISPLAY"
    "WAYLAND_DISPLAY"
  ];

  # Keep the nix-on-rocks boot-selected guest profile in sync after switches.
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
    korri-rk3566-kiosk-system
    target=${config.networking.hostName}
  '';
}
