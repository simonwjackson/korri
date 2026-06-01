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
  sm8550Packages = import nixpkgs {
    system = targetSystem;
    config.allowUnfree = true;
  };
  # Gamescope >= 3.16.20 is required for the Moonlight v4l2m2m streaming
  # path on SM8550 (see assertion below). nixos-25.11 currently ships
  # 3.16.17, so we pin Gamescope to the same nixpkgs revision the x86
  # compositor overlay uses (see nix/overlays/korri-x86-compositor.nix).
  # That rev (0c6db2b5...) carries Gamescope 3.16.23 with the pipewire
  # loop-lock fix. Delete this pin once nixos-25.11 backports a 3.16.20+
  # Gamescope and the channel pkgs satisfies the assertion directly.
  sm8550GamescopePinnedNixpkgs =
    import
      (builtins.fetchTarball {
        url = "https://github.com/NixOS/nixpkgs/archive/0c6db2b5d257d845bbee67a38dee43bbca3bd462.tar.gz";
        sha256 = "0pxv3drindhj4x8cilpcmjz94f7npcsi6rw4h1qhqimxmg40q5z3";
      })
      {
        system = targetSystem;
        config.allowUnfree = true;
      };
  sm8550GamescopePackage = sm8550GamescopePinnedNixpkgs.gamescope;
  sm8550 = config.rocknix.sm8550;
  # Neutral substrate capabilities owned by nix-on-rocks. Korri reads
  # these to compose the Moonlight launch environment; it must not
  # hard-code Linux video/audio facts in this platform adapter and must
  # not reach into RockNix-specific option paths (e.g.
  # rocknix.sm8550.moonlight.*) for substrate values. The substrate is
  # free to change device profile facts under these neutral options
  # without forcing a Korri edit.
  substrateVideoDecodeBackend = sm8550.video.decodeBackend;
  substrateAudioApi = sm8550.audio.api;
  substrateHasInputplumberSm8550Maps = builtins.hasAttr "inputplumber-sm8550-maps" substratePackages;
  inputplumberSm8550Maps =
    if substrateHasInputplumberSm8550Maps then
      substratePackages.inputplumber-sm8550-maps
    else
      pkgs.runCommand "sm8550-maps-unavailable-sentinel" { } ''
        mkdir -p "$out/share"
      '';
  # KORRI_MOONLIGHT_PLATFORM is the Korri product policy that maps the
  # substrate-declared video decode backend onto Moonlight Embedded's
  # -platform CLI shape. The mapping is intentionally identity today
  # because Moonlight Embedded uses the same names the substrate uses,
  # but expressing it as a derived value keeps the boundary honest: this
  # platform adapter does not hard-code v4l2m2m.
  moonlightLaunchEnvironment = {
    KORRI_MOONLIGHT_COMMAND = "${pkgs.moonlight-embedded}/bin/moonlight";
    KORRI_MOONLIGHT_CLIENT = "embedded";
    KORRI_MOONLIGHT_MAPPING_FILE = "${pkgs.moonlight-embedded}/share/moonlight/gamecontrollerdb.txt";
    KORRI_MOONLIGHT_PLATFORM = substrateVideoDecodeBackend;
    KORRI_MOONLIGHT_STARTUP_OBSERVE_MS = "750";
  };
  # SDL clients (Moonlight, Cemu) talk to the substrate audio graph via
  # the API nix-on-rocks exposes. The substrate currently reports
  # pulseaudio; Korri applies it as SDL_AUDIODRIVER. If the substrate
  # later declares a different API, Korri's launch env follows without
  # editing this file.
  moonlightCompositorEnvironment = moonlightLaunchEnvironment // {
    SDL_AUDIODRIVER = substrateAudioApi;
    SDL_VIDEODRIVER = "wayland";
    XDG_CACHE_HOME = "/storage/.cache";
  };
  moonlightSessiondEnvironment = moonlightLaunchEnvironment // {
    SDL_AUDIODRIVER = substrateAudioApi;
    XDG_CACHE_HOME = "/storage/.cache";
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
        toString config.services.korri.compositor.gamescope.package == toString sm8550GamescopePackage;
      message = "RockNix SM8550 compositors must use the SM8550-validated Gamescope package.";
    }
    {
      assertion = substrateHasInputplumberSm8550Maps;
      message = "RockNix SM8550 Korri images require nix-on-rocks packages.${targetSystem}.inputplumber-sm8550-maps.";
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

  services.inputplumber.package = lib.mkForce pkgs.inputplumber;

  services.korri.client.package = korri.packages.${targetSystem}.korri-desktop-device;

  services.korri.compositor = {
    user = lib.mkDefault "root";
    createUser = lib.mkDefault false;
    home = lib.mkDefault "/storage";
    runtimeDir = lib.mkDefault "/run/user/0";

    sessionBus = {
      mode = lib.mkDefault "existing";
      address = lib.mkDefault "unix:path=/run/user/0/bus";
      services = lib.mkDefault [ "main-space-session-dbus.service" ];
    };

    gamescope.package = lib.mkForce sm8550GamescopePackage;

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
      # `pkgs.moonlight-embedded` is replaced by `moonlight-embedded-korri`
      # via nix/overlays/korri-packages.nix, so the SM8550 v4l2m2m build is
      # the Korri downstream variant with the absolute-touch + Sunshine
      # runtime-settings patches layered on top.
      pkgs.moonlight-embedded
    ];

    environment = moonlightCompositorEnvironment // {
      XDG_CURRENT_DESKTOP = "sway";
      CEMU_BIOS_ROOT = "/storage/roms/bios/cemu";
      CEMU_AFFINITY_MASK = sm8550.performance.cemuAffinityMask;
      WLR_NO_HARDWARE_CURSORS = "1";
      WLR_LIBINPUT_NO_DEVICES = "1";
      USER = "root";
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
    KORRI_INPUTD_VOLUME_UP = "true";
    KORRI_INPUTD_VOLUME_DOWN = "true";
  };

  # Sessiond now owns foreground launches directly, and korri-server composes
  # remote-source Moonlight argv before delegating to sessiond. Keep the
  # SM8550 Moonlight adapter on both units; compositor-only env was enough
  # when Sway spawned Moonlight children, but not after renderer/sessiond
  # lifecycle ownership moved out of the compositor process tree.
  services.korri.sessiond = {
    path = [ pkgs.moonlight-embedded ];
    extraEnvironment = moonlightSessiondEnvironment;
  };

  systemd.services.korri-server.environment = moonlightLaunchEnvironment;

  # NOTE: `rocknix.sm8550.moonlight.{enable,package}` is no longer set
  # here. Moonlight is a Korri product choice; the substrate should not
  # carry an installer/option pair for it. Korri's compositor and
  # sessiond paths above already pull `pkgs.moonlight-embedded` into
  # their PATHs explicitly, and the persistent client keydir is owned
  # by Korri's appliance composition. The substrate-side guest module
  # guarding those options is scheduled for removal in a follow-up
  # nix-on-rocks PR now that this file stops setting them.

  # Korri's compositor runs as root with no controlling TTY (getty@tty1 is
  # masked by the nix-on-rocks guest base). Without lingering, logind
  # classifies the implicit sway-owned session as abandoned and tears down
  # user-runtime-dir@0 ~60 s after boot. That cascades:
  #   user-runtime-dir@0 -> main-space-runtime-dir
  #     -> main-space-session-dbus -> korri-compositor.
  # Lingering keeps user@0.service alive regardless of session state, so the
  # whole main-space session-dbus / pipewire / compositor chain survives.
  # Validated on bandi 2026-05-25 after 12+ min idle soak with linger=yes.
  users.users.root.linger = true;

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
      "${config.services.inputplumber.package}/share"
      "${inputplumberSm8550Maps}/share"
      "/run/current-system/sw/share"
    ]
  );

  environment.etc."rocknix-stage10-proof-marker".text = ''
    korri-rocknix-kiosk-system
    target=${config.networking.hostName}
  '';

  environment.systemPackages = [
    substratePackages.cemu
    substratePackages.steam
  ];
}
