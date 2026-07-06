# Image-eval check for the rootless source-machine composition.
{ pkgs, sourceMachineSystem }:

let
  lib = pkgs.lib;
  cfg = sourceMachineSystem.config;
  imagePkgs = sourceMachineSystem.pkgs;
  failedAssertions = builtins.filter (a: !a.assertion) cfg.assertions;
  sessiondUnit = cfg.systemd.user.services.korri-sessiond or { };
  sessiondEnv = sessiondUnit.environment or { };
  sessiondPath = sessiondUnit.path or [ ];
  gameStreamPath = cfg.services.korri.gameStream.path or [ ];
  daemonUnit = cfg.systemd.user.services.korrid or { };
  daemonEnv = daemonUnit.environment or { };
  compositorUnit = cfg.systemd.user.services."korri-compositor" or { };
  inputdUnit = cfg.systemd.user.services.korri-inputd or { };
  greetdSettings = cfg.services.greetd.settings or { };
  sunshineUnit = cfg.systemd.user.services."korri-sunshine" or { };
  sunshineEnv = sunshineUnit.environment or { };
  korriUser = cfg.users.users.korri or { };
  firstAppCmd =
    let
      apps = cfg.services.sunshine.applications.apps or [ ];
    in
    if apps == [ ] then null else (builtins.elemAt apps 0).cmd;
  firstAppWrapper = if firstAppCmd == null then "" else builtins.readFile firstAppCmd;

  packageMatches = expected: package: (package.pname or package.name or "") == expected;
  hasPackage = expected: packages: builtins.any (packageMatches expected) packages;
  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "image evaluates without assertion failures${lib.optionalString (failedAssertions != [ ]) ": ${lib.concatMapStringsSep "; " (a: a.message) failedAssertions}"}" (failedAssertions == [ ]))
    (check "runtime user is korri" (
      cfg.services.korri.runtime.user == "korri" && cfg.users.users ? korri
    ))
    (check "korri is a normal stable runtime user" (
      (korriUser.isNormalUser or false) == true && (korriUser.uid or 0) != 0
    ))
    (check "korri user has appliance runtime groups" (
      builtins.all (g: builtins.elem g (korriUser.extraGroups or [ ])) [
        "input"
        "render"
        "seat"
        "video"
      ]
    ))
    (check "compositor, Sunshine, sessiond and daemon are user services" (
      cfg.systemd.user.services ? "korri-compositor"
      && cfg.systemd.user.services ? "korri-sunshine"
      && cfg.systemd.user.services ? korri-sessiond
      && cfg.systemd.user.services ? korrid
      && !(cfg.systemd.services ? "korri-sunshine")
    ))
    (check "Korri login autologs into the runtime user" (
      cfg.services.korri.login.enable
      && cfg.services.greetd.enable
      && greetdSettings.initial_session.user == cfg.services.korri.runtime.user
      && greetdSettings.default_session.user == cfg.services.korri.runtime.user
      && lib.hasInfix "sleep infinity" (builtins.readFile cfg.services.korri.login.command)
      && !lib.hasInfix "systemctl" (builtins.readFile cfg.services.korri.login.command)
      && !lib.hasInfix "--machine=" (builtins.readFile cfg.services.korri.login.command)
      && !(builtins.elem "korri-session.target" (cfg.systemd.user.targets.default.wants or [ ]))
      && builtins.elem "L+ /home/korri/.config/systemd/user/default.target.wants/korri-session.target - - - - /etc/systemd/user/korri-session.target" cfg.systemd.tmpfiles.rules
    ))
    (check "root setup service is required by greetd" (
      builtins.elem "korri-setup.service" (cfg.systemd.services.greetd.requires or [ ])
    ))
    (check "sessiond role is source-machine" (
      cfg.services.korri.sessiond.role == "source-machine"
      && sessiondEnv.KORRI_SESSIOND_ROLE == "source-machine"
    ))
    (check "sessiond socket path is exported" (
      sessiondEnv.KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"
    ))
    (check "source-machine enables sessiond-owned input seats" (
      cfg.services.korri.input.inputSeat.enable
      && cfg.services.korri.input.inputSeat.user == cfg.services.korri.runtime.user
      && cfg.services.korri.input.inputSeat.group == "uinput"
      && sessiondEnv.KORRI_INPUT_SEAT_RUNTIME_DIR == "%t/korri/input-seat"
      && lib.hasPrefix "/nix/store/" sessiondEnv.KORRI_INPUT_SEAT_BACKEND_HELPER
      && lib.hasSuffix "/bin/korri-uinput-seat-helper" sessiondEnv.KORRI_INPUT_SEAT_BACKEND_HELPER
      && builtins.elem "uinput" (korriUser.extraGroups or [ ])
    ))
    (check "stream-host socket delegation cannot drift" (
      cfg.services.korri.sessiond.socketPath == "%t/korri/sessiond.sock"
      && cfg.services.korri.daemon.sessiond.socketPath == cfg.services.korri.sessiond.socketPath
      && cfg.services.korri.gameStream.sessiond.socketPath == cfg.services.korri.sessiond.socketPath
    ))
    (check "sessiond foreground children inherit Wayland identity" (
      sessiondEnv.XDG_RUNTIME_DIR == cfg.services.korri.compositor.runtimeDir
      && sessiondEnv.WAYLAND_DISPLAY == "wayland-1"
      && sessiondEnv.XDG_SESSION_TYPE == "wayland"
      && sessiondEnv.XDG_CURRENT_DESKTOP == "sway"
      && sessiondEnv.DISPLAY == ":0"
    ))
    (check "first-party Gamescope plugin is enabled for source-machine runtime registries" (
      lib.hasInfix "@korri:gamescope" (daemonEnv.KORRI_ENABLED_PLUGINS or "")
      && lib.hasInfix "@korri:gamescope" (sessiondEnv.KORRI_ENABLED_PLUGINS or "")
      && lib.hasInfix "@korri:gamescope" firstAppWrapper
    ))
    (check "first-party Gamescope package reaches sessiond and game-stream PATHs" (
      hasPackage "gamescope-korri" sessiondPath
      && hasPackage "gamescope-korri" gameStreamPath
      && lib.hasInfix "coreutils" firstAppWrapper
      && lib.hasInfix "util-linux" firstAppWrapper
    ))
    (check "daemon uses Korri product library root" (
      cfg.services.korri.daemon.library.root == "/var/lib/korri/library"
      && daemonEnv.KORRI_LIBRARY_ROOT == "/var/lib/korri/library"
    ))
    (check "sessiond inherits Korri product library root" (
      sessiondEnv.KORRI_LIBRARY_ROOT == "/var/lib/korri/library"
    ))
    (check "daemon uses sessiond socket" (daemonEnv.KORRI_SESSIOND_SOCKET == "%t/korri/sessiond.sock"))
    (check "gameStream uses sessiond socket" (
      cfg.services.korri.gameStream.sessiond.socketPath == "%t/korri/sessiond.sock"
    ))
    (check "Sunshine wrapper exports KORRI_SESSIOND_SOCKET" (
      lib.hasInfix "KORRI_SESSIOND_SOCKET" firstAppWrapper
    ))
    (check "Sunshine uses Korri downstream runtime-settings package" (
      cfg.services.sunshine.package.pname == "sunshine-korri"
    ))
    (check "Sunshine live-settings gate is persistent Nix config" (
      sunshineEnv.SUNSHINE_LIVE_SETTINGS_MVP == "1"
    ))
    (check "legacy sessiond URL/token env absent" (
      !(daemonEnv ? KORRI_SESSIOND_URL)
      && !(daemonEnv ? KORRI_SESSIOND_TOKEN_FILE)
      && !lib.hasInfix "KORRI_SESSIOND_URL" firstAppWrapper
      && !lib.hasInfix "KORRI_SESSIOND_TOKEN_FILE" firstAppWrapper
    ))
    (check "sessiond PATH includes util-linux" (builtins.elem imagePkgs.util-linux sessiondPath))
    (check "source-machine udev grants Korri Seat event-node access" (
      lib.hasInfix ''ATTRS{name}=="Korri Seat P*", GROUP="uinput", MODE="0660"'' (cfg.services.udev.extraRules or "")
      && !lib.hasInfix ''TAG+="uaccess"'' (cfg.services.udev.extraRules or "")
    ))
    (check "compositor participates in korri-session.target" (
      (compositorUnit.wantedBy or [ ]) == [ "korri-session.target" ]
    ))
    (check "source-machine keeps local kiosk surfaces disabled" (
      cfg.services.korri.compositor.enable
      && !cfg.services.korri.compositor.kiosk.enable
      && !cfg.services.korri.client.enable
      && !(lib.attrByPath [ "services" "korri" "webSurfaceHost" "enable" ] false cfg)
    ))
    (check "source-machine uses the canonical logind runtime root" (
      cfg.services.korri.compositor.runtimeDir == "%t"
      && sessiondEnv.XDG_RUNTIME_DIR == "%t"
      && sessiondEnv.SWAYSOCK == "%t/sway-ipc.sock"
    ))
    (check "source-machine shares the existing user session bus" (
      cfg.services.korri.compositor.sessionBus.mode == "existing"
      && cfg.services.korri.compositor.sessionBus.address == "unix:path=%t/bus"
      && sessiondEnv.DBUS_SESSION_BUS_ADDRESS == "unix:path=%t/bus"
    ))
    (check "source-machine provides x86 PipeWire audio defaults" (
      cfg.services.pipewire.enable
      && cfg.services.pipewire.pulse.enable
      && cfg.services.pipewire.alsa.support32Bit
      && cfg.services.pipewire.wireplumber.enable
      && !cfg.services.pulseaudio.enable
      && cfg.security.rtkit.enable
    ))
  ];
  failures = builtins.filter (c: !c.assertion) checks;
in
if failures != [ ] then
  throw "korri-source-machine image check failed:\n${
    lib.concatMapStringsSep "\n" (c: "- ${c.message}") failures
  }"
else
  pkgs.runCommand "korri-source-machine-image-check" { } ''
    echo "All ${toString (builtins.length checks)} korri-source-machine image checks passed."
    touch $out
  ''
