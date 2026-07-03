{
  korri,
  nixpkgs,
  nix-on-rocks,
  deviceProfile,
  # Accepted for a uniform platform-adapter signature; this chipset does not
  # yet consume a declared home output.
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
  inputplumberPackage = substratePackages.inputplumber;
  inputplumberDataPackage = pkgs.runCommand "korri-rocknix-rk3566-inputplumber-data-xb360" { } ''
    mkdir -p $out/share
    cp -a ${inputplumberPackage}/share/inputplumber $out/share/inputplumber
    chmod -R u+w $out
    cp -a ${substratePackages.inputplumber-rk3566-maps}/share/inputplumber/. $out/share/inputplumber/
    chmod -R u+w $out
    ${inputplumberHelpers.patchInputplumberXb360Target { targetDeviceYaml = "01-rg353m.yaml"; }}
  '';
  gamescopeNix = import ../../../../plugins/gamescope/nix/platform-environments.nix { inherit pkgs; };
  gamescopePackage = korri.packages.${targetSystem}.gamescope-korri;
  gamescopeRuntimeEnvironment = gamescopeNix.rk3566RuntimeEnvironment;
  enabledFirstPartyPlugins = "@korri:gamescope,@korri:neverball";
  runtime = config.services.korri.runtime;
  rk3566RuntimeDir = "/run/user/${toString runtime.uid}";
  rk3566PulseServer = "unix:${rk3566RuntimeDir}/pulse/native";
  rk3566TargetSink = config.rocknix.device.audio.defaultSink.name;

  hideRawGamepadDevices = pkgs.writeShellScript "korri-rk3566-hide-raw-gamepad-devices" ''
    set -euo pipefail
    export PATH=${
      lib.makeBinPath [
        pkgs.coreutils
        pkgs.gawk
      ]
    }

    ${pkgs.gawk}/bin/awk '
      /^N: Name="retrogame_joypad"/ { matched = 1 }
      matched && /^H: Handlers=/ {
        for (i = 2; i <= NF; i++) {
          sub(/^Handlers=/, "", $i)
          if ($i ~ /^(event|js)[0-9]+$/) print $i
        }
        matched = 0
      }
      /^$/ { matched = 0 }
    ' /proc/bus/input/devices | while read -r handler; do
      for node in "/dev/input/$handler" "/dev/inputplumber/sources/$handler"; do
        [ -e "$node" ] || continue
        chown root:root "$node" || true
        chmod 000 "$node" || true
      done
    done
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
    ../../modules/korri-rocknix-audio-bootstrap.nix
    ../../modules/korri-rocknix-guest-profile.nix
  ];

  # RK3566 intentionally does not import the shared RockNIX guest device-access
  # module yet. Unlike SM8550, the compositor runs as root, audio is reached
  # through the substrate main-space Pulse socket, and the physical
  # retrogame_joypad nodes are locked down after InputPlumber claims them.
  # Broad /dev/input ACL repair would risk undoing that raw-node hiding; the
  # app-facing virtual Xbox controller is covered by the Korri runtime user's
  # input-group membership instead.
  services.inputplumber.package = lib.mkForce inputplumberPackage;
  services.korri.rocknixGuestProfile = {
    enable = true;
    proofMarkerLabel = "korri-rk3566-kiosk-system";
  };
  services.korri.rocknixAudioBootstrap = {
    enable = true;
    pulseServer = rk3566PulseServer;
    targetSink = rk3566TargetSink;
    safeVolume = "10%";
    serviceScope = "system";
    failOnSocketUnavailable = true;
    actions = [
      {
        kind = "clamp-target-sink";
        onFailure = "fail";
      }
    ];
  };
  services.korri.client.package = korri.packages.${targetSystem}.korri-chromium-kiosk;

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

  environment.systemPackages = [ (lib.hiPrio inputplumberDataPackage) ];

  services.udev.extraRules = ''
    # Hide the RG353M raw physical gamepad source nodes from foreground apps
    # once InputPlumber owns the app-facing controller contract. Match the
    # claimed source by name instead of using broad negative matches, otherwise
    # the virtual Xbox controller can be hidden before apps enumerate it.
    SUBSYSTEM=="input", KERNEL=="event*", ATTRS{name}=="retrogame_joypad", GROUP="root", MODE="0000"
    SUBSYSTEM=="input", KERNEL=="js*", ATTRS{name}=="retrogame_joypad", GROUP="root", MODE="0000"
  '';

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
    services = lib.mkDefault [
      "inputplumber.service"
      "korri-rk3566-hide-raw-gamepad-devices.service"
    ];
    extraDataPackages = [ inputplumberDataPackage ];
  };

  systemd.services.korri-rk3566-hide-raw-gamepad-devices = {
    description = "Hide RG353M raw gamepad nodes after InputPlumber claims them";
    wantedBy = [ "multi-user.target" ];
    after = [ "inputplumber.service" ];
    requires = [ "inputplumber.service" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = hideRawGamepadDevices;
      RemainAfterExit = true;
    };
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
  # would collide in ProseQL. Apply the Xwayland route at the host layer; the
  # shared RetroArch module owns the InputPlumber udev/autodetect/autoconfig
  # policy for generated RetroArch configs.
  services.korri.daemon.library.platformDefaults.host = {
    launch."with"."@korri:gamescope".app.environment.WAYLAND_DISPLAY = null;
  };

  systemd.user.services.korrid.environment.KORRI_ENABLED_PLUGINS = enabledFirstPartyPlugins;

  systemd.services.korri-rocknix-audio-bootstrap = {
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
    };
    serviceConfig.User = "root";
  };

  systemd.services.greetd = {
    requires = [ "korri-rocknix-audio-bootstrap.service" ];
    after = [ "korri-rocknix-audio-bootstrap.service" ];
  };

  systemd.user.services.korri-compositor.serviceConfig.UnsetEnvironment = [
    "DISPLAY"
    "WAYLAND_DISPLAY"
  ];

}
