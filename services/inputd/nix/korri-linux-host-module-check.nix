{
  pkgs,
  module,
  sunshinePackage,
  inputdPackage,
  inputplumberKorri,
  korridPackage,
  korriBundle,
}:
let
  lib = pkgs.lib;
  evaluate =
    extra:
    import "${pkgs.path}/nixos/lib/eval-config.nix" {
      system = pkgs.stdenv.hostPlatform.system;
      modules = [
        module
        {
          system.stateVersion = "26.05";
          boot.loader.grub.enable = false;
          fileSystems."/" = {
            device = "none";
            fsType = "tmpfs";
          };
          networking.hostName = "consumer";
          users.groups.games.gid = 1001;
          users.users.gameplay = {
            isNormalUser = true;
            group = "games";
            home = "/home/gameplay";
          };
          services.korriBundle = {
            initialPackage = korriBundle;
            launcherPackage = inputdPackage;
          };
          services.korriLinuxInput = {
            provider.package = inputplumberKorri;
            inputd.package = inputdPackage;
          };
          services.korridLinuxDevice.package = korridPackage;
          services.korriLinuxHost = {
            enable = true;
            gameplayUser = "gameplay";
            gameplayUid = 1001;
            gameplayGroup = "games";
            gameplayGid = 1001;
            firewallInterfaces = [ "tailscale0" ];
            sunshine.package = sunshinePackage;
          };
        }
        extra
      ];
    };
  allAssertionsPass =
    system:
    lib.all (
      entry: if entry.assertion then true else builtins.trace entry.message false
    ) system.config.assertions;
  hasFailedAssertion =
    needle: system:
    lib.any (entry: !entry.assertion && lib.hasInfix needle entry.message) system.config.assertions;
  evaluationRejected =
    system: !(builtins.tryEval system.config.system.build.toplevel.drvPath).success;
  valid = evaluate { };
  noValidation = evaluate {
    services.korriLinuxHost.validation.enable = false;
  };
  noRuntimeSettings = evaluate {
    services.korriLinuxHost.sunshine.runtimeSettings.enable = false;
  };
  nvenc = evaluate {
    services.korriLinuxHost.sunshine.encoder = "nvenc";
  };
  vaapi = evaluate {
    services.korriLinuxHost.sunshine.encoder = "vaapi";
  };
  wrongGameplayUid = evaluate {
    users.users.gameplay.uid = lib.mkForce 1002;
  };
  stockSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce pkgs.sunshine;
  };
  lookalikeSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce (
      pkgs.sunshine.overrideAttrs (_: {
        pname = "sunshine-korri";
      })
    );
  };
  strippedApprovedSunshine = evaluate {
    services.korriLinuxHost.sunshine.package = lib.mkForce (
      sunshinePackage.overrideAttrs (_: {
        patches = [ ];
      })
    );
  };
  collidingIdentity = evaluate {
    services.korriLinuxHost.serviceIdentities.inputdUid = lib.mkForce 1001;
  };
  invalidLabel = evaluate {
    services.korriLinuxHost.label = "bad label";
  };
  cfg = valid.config;
  inputd = cfg.systemd.services.korri-inputd;
  korrid = cfg.systemd.services.korrid;
  sunshine = cfg.systemd.services.sunshine;
  x11 = cfg.systemd.services.x11-headless;
  deviceConfig = cfg.services.korridLinuxDevice.deviceConfig;
  sunshineExec = pkgs.writeText "korri-linux-host-sunshine-exec" sunshine.serviceConfig.ExecStart;
  udevRules = pkgs.writeText "korri-linux-host-udev-rules" cfg.services.udev.extraRules;
in
assert allAssertionsPass valid;
assert cfg.services.korriBundle.enable;
assert cfg.services.korriLinuxInput.provider.enable;
assert !cfg.services.korriLinuxInput.provider.sourceHiding.enable;
assert cfg.services.korriLinuxInput.inputd.enable;
assert cfg.services.korridLinuxDevice.enable;
assert cfg.services.inputplumber.enable;
assert cfg.services.sunshine.enable;
assert !cfg.services.sunshine.autoStart;
assert !cfg.systemd.user.services.sunshine.enable;
assert cfg.services.sunshine.package == sunshinePackage;
assert cfg.services.korriLinuxHost.sunshine.runtimeSettings.enable;
assert cfg.services.korriLinuxHost.sunshine.encoder == "auto";
assert sunshine.environment.SUNSHINE_LIVE_SETTINGS_MVP == "1";
assert allAssertionsPass nvenc;
assert allAssertionsPass vaapi;
assert
  nvenc.config.systemd.services.sunshine.environment.LD_LIBRARY_PATH == "/run/opengl-driver/lib";
assert nvenc.config.systemd.services.sunshine.environment.SUNSHINE_STRICT_ENCODER == "1";
assert !(builtins.hasAttr "LD_LIBRARY_PATH" sunshine.environment);
assert !(builtins.hasAttr "SUNSHINE_STRICT_ENCODER" sunshine.environment);
assert !(builtins.hasAttr "LD_LIBRARY_PATH" vaapi.config.systemd.services.sunshine.environment);
assert
  !(builtins.hasAttr "SUNSHINE_STRICT_ENCODER" vaapi.config.systemd.services.sunshine.environment);
assert builtins.length nvenc.config.systemd.services.sunshine.serviceConfig.ExecCondition == 1;
assert vaapi.config.systemd.services.sunshine.serviceConfig.ExecCondition == [ ];
assert
  let
    script = builtins.readFile (
      builtins.elemAt nvenc.config.systemd.services.sunshine.serviceConfig.ExecCondition 0
    );
  in
  lib.hasInfix "/run/opengl-driver/lib/libcuda.so.1" script
  && lib.hasInfix "/run/opengl-driver/lib/libnvidia-encode.so.1" script;
assert
  nvenc.config.systemd.services.sunshine.serviceConfig.ExecStart
  == "${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf log_path=/dev/null encoder=nvenc";
assert noRuntimeSettings.config.services.sunshine.package == sunshinePackage;
assert
  noRuntimeSettings.config.systemd.services.sunshine.serviceConfig.ExecStart
  == "${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf log_path=/dev/null";
assert
  !(builtins.hasAttr "SUNSHINE_LIVE_SETTINGS_MVP" noRuntimeSettings.config.systemd.services.sunshine.environment);
assert cfg.hardware.graphics.enable;
assert builtins.elem pkgs.intel-media-driver cfg.hardware.graphics.extraPackages;
assert builtins.elem "uinput" cfg.boot.kernelModules;
assert cfg.users.users.korri-inputd.uid == 977;
assert cfg.users.groups.korri-control.gid == 977;
assert cfg.users.users.korrid.uid == 976;
assert cfg.users.groups.korrid.gid == 976;
assert cfg.users.groups.korri-sunshine-uinput.gid == 979;
assert builtins.elem "render" cfg.users.users.gameplay.extraGroups;
assert builtins.elem "video" cfg.users.users.gameplay.extraGroups;
assert !(builtins.elem "input" cfg.users.users.gameplay.extraGroups);
assert !(builtins.elem "uinput" cfg.users.users.gameplay.extraGroups);
assert inputd.serviceConfig.User == "korri-inputd";
assert korrid.serviceConfig.User == "korrid";
assert korrid.environment.KORRID_SUNSHINE_PRIVATE_STATE_ROOT == "/home/gameplay/.config/sunshine";
assert cfg.services.korridLinuxDevice.sunshinePrivateStateRoot == "/home/gameplay/.config/sunshine";
assert sunshine.serviceConfig.User == "gameplay";
assert sunshine.serviceConfig.WorkingDirectory == "/home/gameplay";
assert sunshine.environment.DISPLAY == ":0";
assert sunshine.environment.HOME == "/home/gameplay";
assert sunshine.environment.XDG_CONFIG_HOME == "/home/gameplay/.config";
assert
  sunshine.serviceConfig.ExecStart
  == "${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf log_path=/dev/null";
assert sunshine.serviceConfig.ProtectSystem == "strict";
assert sunshine.serviceConfig.ProtectHome == "read-only";
assert builtins.elem "/home/gameplay/.config/sunshine" sunshine.serviceConfig.ReadWritePaths;
assert x11.serviceConfig.User == "gameplay";
assert x11.serviceConfig.PrivateDevices;
assert !(builtins.elem "/dev/inputplumber/sources" (x11.serviceConfig.InaccessiblePaths or [ ]));
assert builtins.elem "korri-input-source-guard.service" sunshine.requires;
assert builtins.elem "x11-headless.service" sunshine.requires;
assert builtins.elem "/dev/inputplumber/sources" sunshine.serviceConfig.InaccessiblePaths;
assert builtins.elem 39217 cfg.networking.firewall.interfaces.tailscale0.allowedTCPPorts;
assert builtins.hasAttr "workspace-next" cfg.services.korriLinuxInput.inputd.actions;
assert builtins.length cfg.services.korriLinuxInput.inputd.actions.workspace-next.command == 1;
assert lib.hasSuffix "/bin/korri-input-action-fixture" (
  builtins.head cfg.services.korriLinuxInput.inputd.actions.workspace-next.command
);
assert noValidation.config.services.korriLinuxInput.inputd.actions == { };
assert hasFailedAssertion "gameplay identity" wrongGameplayUid;
assert evaluationRejected wrongGameplayUid;
assert hasFailedAssertion "exact approved sunshine-korri" stockSunshine;
assert evaluationRejected stockSunshine;
assert hasFailedAssertion "exact approved sunshine-korri" lookalikeSunshine;
assert evaluationRejected lookalikeSunshine;
assert hasFailedAssertion "exact approved sunshine-korri" strippedApprovedSunshine;
assert evaluationRejected strippedApprovedSunshine;
assert hasFailedAssertion "differ from the gameplay identity" collidingIdentity;
assert evaluationRejected invalidLabel;
pkgs.runCommand "korri-linux-host-module-check" { } ''
    grep -F 'id = "inputd-gate"' ${deviceConfig} >/dev/null
    grep -F 'title = "Streaming gate"' ${deviceConfig} >/dev/null
    grep -F '/bin/timeout' ${deviceConfig} >/dev/null
    grep -F -- '--kill-after=5s' ${deviceConfig} >/dev/null
    grep -F '/bin/ffplay' ${deviceConfig} >/dev/null
    grep -F 'fps=120' ${deviceConfig} >/dev/null
    grep -F '/share/korri-streaming-validation/video.mp4' ${deviceConfig} >/dev/null
    grep -F 'DISPLAY = ":0"' ${deviceConfig} >/dev/null
    grep -Fx '${sunshinePackage}/bin/sunshine /home/gameplay/.config/sunshine/sunshine.conf log_path=/dev/null' ${sunshineExec} >/dev/null
    grep -F 'TAG-="uaccess"' ${udevRules} >/dev/null

    media="$(${pkgs.gnugrep}/bin/grep -oE '/nix/store/[^\"]+/share/korri-streaming-validation/video\.mp4' ${deviceConfig} | head -n1)"
    test -f "$media"
    attribution="''${media%/video.mp4}/ATTRIBUTION.txt"
    grep -F 'Blender Foundation 2008' "$attribution" >/dev/null
    probe="$(${lib.getExe' pkgs.ffmpeg "ffprobe"} -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$media")"
    test "$probe" = '1920,1080,60/1'

    display=:91
    ${pkgs.xorg.xorgserver}/bin/Xvfb "$display" -screen 0 1920x1080x24 -nolisten tcp -noreset >"$TMPDIR/xvfb.log" 2>&1 &
    xvfb_pid=$!
    trap '${pkgs.coreutils}/bin/kill "$xvfb_pid" 2>/dev/null || true' EXIT
    attempt=0
    while [ "$attempt" -lt 40 ]; do
      if ${pkgs.xorg.xdpyinfo}/bin/xdpyinfo -display "$display" >/dev/null 2>&1; then
        break
      fi
      attempt=$((attempt + 1))
      ${pkgs.coreutils}/bin/sleep 0.1
    done
    ${pkgs.xorg.xdpyinfo}/bin/xdpyinfo -display "$display" >/dev/null
    DISPLAY="$display" ${pkgs.coreutils}/bin/timeout --signal=TERM --kill-after=1s 8 \
      ${lib.getExe' pkgs.ffmpeg "ffplay"} -loglevel error -nostats -fs -an -loop 0 -vf fps=120 \
      -window_title 'Korri streaming gate' "$media" >"$TMPDIR/ffplay.log" 2>&1 &
    player_pid=$!
    attempt=0
    while [ "$attempt" -lt 50 ]; do
      if DISPLAY="$display" ${pkgs.xorg.xwininfo}/bin/xwininfo -root -tree 2>/dev/null | grep -F 'Korri streaming gate' >/dev/null; then
        break
      fi
      test -e "/proc/$player_pid"
      attempt=$((attempt + 1))
      ${pkgs.coreutils}/bin/sleep 0.1
    done
    DISPLAY="$display" ${pkgs.xorg.xwininfo}/bin/xwininfo -root -tree | grep -F 'Korri streaming gate' >/dev/null
    test -e "/proc/$player_pid"
    ${pkgs.coreutils}/bin/kill "$player_pid"
    wait "$player_pid" || true
    ${pkgs.coreutils}/bin/kill "$xvfb_pid"
    wait "$xvfb_pid" || true
    trap - EXIT

    home="$TMPDIR/home"
    private="$home/.config/sunshine"
    mkdir -p "$private/credentials"
    printf '{"root":{"named_devices":[]}}\n' > "$private/sunshine_state.json"
    printf '{}\n' > "$private/apps.json"
    cat > "$private/sunshine.conf" <<EOF
  file_state = $private/sunshine_state.json
  log_path = $private/sunshine.log
  EOF
    private_before="$(${inputdPackage}/bin/korri-sunshine-state-digest "$home" "$(${pkgs.coreutils}/bin/id -u)")"
    HOME="$home" XDG_CONFIG_HOME="$home/.config" \
      ${sunshinePackage}/bin/sunshine "$private/sunshine.conf" log_path=/dev/null --version \
      > "$TMPDIR/sunshine-version.txt"
    private_after="$(${inputdPackage}/bin/korri-sunshine-state-digest "$home" "$(${pkgs.coreutils}/bin/id -u)")"
    test "$private_before" = "$private_after"
    test ! -e "$private/sunshine.log"
    grep -F 'Sunshine version: 2025.924.154138-korri' "$TMPDIR/sunshine-version.txt" >/dev/null

    touch "$out"
''
