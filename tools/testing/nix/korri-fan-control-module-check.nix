# Pure-Nix module-evaluation check plus hermetic behavioral check for
# `services.korri.fanControl`.
#
# The eval half asserts option validation and rendered unit shape without any
# build graph. The behavioral half executes the generated control-loop and
# restore scripts against mock sysfs trees inside the build sandbox, using the
# scripts' test contract (KORRI_FAN_SYSFS_ROOT, KORRI_FAN_MAX_ITERATIONS,
# KORRI_FAN_STATUS_FILE) — no device required for logic coverage.
#
# Run with:
#   nix build .#checks.x86_64-linux.korri-fan-control-module --no-link
{
  pkgs,
  korriFanControlModule,
}:

let
  lib = pkgs.lib;
  evalConfig = import (pkgs.path + "/nixos/lib/eval-config.nix");

  hostSystem = pkgs.stdenv.hostPlatform.system;

  baseModule =
    { ... }:
    {
      nixpkgs.hostPlatform = hostSystem;
      boot.loader.grub.devices = [ "nodev" ];
      fileSystems."/" = {
        device = "/dev/null";
        fsType = "ext4";
      };
      system.stateVersion = "24.11";
      networking.hostName = "korri-test";
    };

  evaluateWith =
    overrides:
    (evalConfig {
      system = hostSystem;
      modules = [
        korriFanControlModule
        baseModule
        overrides
      ];
    }).config;

  gamingCurve = [
    {
      tempC = 45;
      pwmPercent = 45;
    }
    {
      tempC = 65;
      pwmPercent = 70;
    }
    {
      tempC = 85;
      pwmPercent = 100;
    }
  ];

  # Primary fixture: thermal-zone temp source, Thor-like curve, idle floor.
  zoneFixture = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "thermal-zone";
        zoneType = "mock-thermal";
      };
      curve = gamingCurve;
      idlePwmPercent = 20;
      profileName = "test-profile";
    };
  };

  # Secondary fixture: temp channel on the fan hwmon itself.
  channelFixture = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "hwmon-channel";
        channel = 1;
      };
      profileName = "channel-profile";
    };
  };

  disabled = evaluateWith { };

  missingHwmonName = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      tempSource = {
        kind = "hwmon-channel";
      };
    };
  };

  missingTempSource = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
    };
  };

  zoneWithoutType = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "thermal-zone";
      };
    };
  };

  emptyCurve = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "hwmon-channel";
      };
      curve = [ ];
    };
  };

  unsortedCurve = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "hwmon-channel";
      };
      curve = [
        {
          tempC = 60;
          pwmPercent = 50;
        }
        {
          tempC = 45;
          pwmPercent = 30;
        }
      ];
    };
  };

  duplicateCurveTemps = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "hwmon-channel";
      };
      curve = [
        {
          tempC = 60;
          pwmPercent = 50;
        }
        {
          tempC = 60;
          pwmPercent = 70;
        }
      ];
    };
  };

  weakCurve = evaluateWith {
    services.korri.fanControl = {
      enable = true;
      hwmonName = "mockfan";
      tempSource = {
        kind = "hwmon-channel";
      };
      curve = [
        {
          tempC = 50;
          pwmPercent = 40;
        }
        {
          tempC = 70;
          pwmPercent = 60;
        }
      ];
    };
  };

  failedAssertions = cfg: builtins.filter (a: !a.assertion) cfg.assertions;
  fanService = cfg: cfg.systemd.services.korri-fan-control or { };

  zoneService = fanService zoneFixture;
  loopScriptPath = zoneService.serviceConfig.ExecStart or "";
  restoreScriptPath = zoneService.serviceConfig.ExecStopPost or "";
  loopScript = builtins.readFile loopScriptPath;
  channelLoopScriptPath = (fanService channelFixture).serviceConfig.ExecStart or "";

  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "disabled module renders no fan-control service" (
      !(disabled.systemd.services ? korri-fan-control)
    ))
    (check "enabled module renders a hardened root system service" (
      (zoneService.serviceConfig.Type or null) == "simple"
      && (zoneService.serviceConfig.Restart or null) == "on-failure"
      && (zoneService.serviceConfig.ExecStopPost or null) != null
      && (zoneService.serviceConfig.ProtectSystem or null) == "strict"
      && !(zoneService.serviceConfig ? ProtectKernelTunables)
      && !(zoneService.serviceConfig ? User)
      && lib.elem "/run/korri-fan-control" (zoneService.serviceConfig.ReadWritePaths or [ ])
      && lib.elem "multi-user.target" (zoneService.wantedBy or [ ])
    ))
    (check "restart budget is bounded" (
      (zoneService.unitConfig.StartLimitBurst or null) != null
      && (zoneService.unitConfig.StartLimitIntervalSec or null) != null
    ))
    (check "status directory is created via tmpfiles" (
      lib.any (rule: lib.hasInfix "/run/korri-fan-control" rule) zoneFixture.systemd.tmpfiles.rules
    ))
    (check "loop script carries identity discovery and test contract" (
      lib.hasInfix "KORRI_FAN_SYSFS_ROOT" loopScript
      && lib.hasInfix "KORRI_FAN_MAX_ITERATIONS" loopScript
      && lib.hasInfix "hwmon_name=mockfan" loopScript
      && lib.hasInfix "temp_zone_type=mock-thermal" loopScript
      && lib.hasInfix "profile_name=test-profile" loopScript
    ))
    (check "enabled module requires hwmonName" (failedAssertions missingHwmonName != [ ]))
    (check "enabled module requires a temp source" (failedAssertions missingTempSource != [ ]))
    (check "thermal-zone temp source requires zoneType" (failedAssertions zoneWithoutType != [ ]))
    (check "enabled module rejects an empty curve" (failedAssertions emptyCurve != [ ]))
    (check "enabled module rejects an unsorted curve" (failedAssertions unsortedCurve != [ ]))
    (check "enabled module rejects duplicate curve temperatures" (
      failedAssertions duplicateCurveTemps != [ ]
    ))
    (check "curve that cannot reach 100% or 85C emits warnings" (
      builtins.length weakCurve.warnings >= 2
    ))
    (check "valid fixtures pass their own assertions" (
      failedAssertions zoneFixture == [ ] && failedAssertions channelFixture == [ ]
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;

  # Expected interpolation values for the gaming curve fixture:
  #   45% -> 115 raw, 70% -> 179 raw, 100% -> 255 raw, idle 20% -> 51 raw.
  #   55C sits halfway between 45C(115) and 65C(179): round(146.5) = 147.
  behavioralCheck =
    pkgs.runCommand "korri-fan-control-module-check"
      {
        nativeBuildInputs = [ pkgs.jq ];
      }
      ''
        set -eu

        loop=${loopScriptPath}
        restore=${restoreScriptPath}
        channel_loop=${channelLoopScriptPath}

        mk_tree() {
          # mk_tree <root> — hwmon named mockfan + thermal zones with shuffled
          # indexes so identity (not index) selection is proven.
          rm -rf "$1"
          mkdir -p "$1/class/hwmon/hwmon7" "$1/class/thermal/thermal_zone0" "$1/class/thermal/thermal_zone5"
          echo mockfan > "$1/class/hwmon/hwmon7/name"
          echo 100 > "$1/class/hwmon/hwmon7/pwm1"
          echo 2 > "$1/class/hwmon/hwmon7/pwm1_enable"
          echo 3100 > "$1/class/hwmon/hwmon7/fan1_input"
          echo other-thermal > "$1/class/thermal/thermal_zone0/type"
          echo 99000 > "$1/class/thermal/thermal_zone0/temp"
          echo mock-thermal > "$1/class/thermal/thermal_zone5/type"
        }

        run_loop() {
          # run_loop <root> <iterations> — status file at <root>/status.json
          KORRI_FAN_SYSFS_ROOT="$1" \
          KORRI_FAN_MAX_ITERATIONS="$2" \
          KORRI_FAN_STATUS_FILE="$1/status.json" \
            "$loop"
        }

        fail() { echo "FAIL: $1" >&2; exit 1; }

        root=$PWD/tree

        # --- Happy path: 65C on the gaming curve -> pwm 179, telemetry sane
        mk_tree "$root"; echo 65000 > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 1
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 179 ] || fail "65C should drive pwm 179, got $(cat "$root/class/hwmon/hwmon7/pwm1")"
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1_enable")" = 1 ] || fail "manual mode should be asserted"
        [ "$(jq -r .profile "$root/status.json")" = test-profile ] || fail "telemetry profile mismatch"
        [ "$(jq -r .temperatureMilliC "$root/status.json")" = 65000 ] || fail "telemetry temp mismatch"
        [ "$(jq -r .pwm "$root/status.json")" = 179 ] || fail "telemetry pwm mismatch"
        [ "$(jq -r .rpm "$root/status.json")" = 3100 ] || fail "telemetry rpm mismatch"

        # --- Interpolation: 55C halfway between 45C(115) and 65C(179) -> 147
        mk_tree "$root"; echo 55000 > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 1
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 147 ] || fail "55C should interpolate to 147, got $(cat "$root/class/hwmon/hwmon7/pwm1")"

        # --- Below first point -> idle floor (20% -> 51)
        mk_tree "$root"; echo 30000 > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 1
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 51 ] || fail "30C should hit idle floor 51, got $(cat "$root/class/hwmon/hwmon7/pwm1")"

        # --- Above last point -> clamp to 255
        mk_tree "$root"; echo 95000 > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 1
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 255 ] || fail "95C should clamp to 255"

        # --- Invalid reading: fresh loop never writes pwm on garbage input
        mk_tree "$root"; echo garbage > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 1
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 100 ] || fail "garbage temp must not change pwm"
        [ "$(jq -r .temperatureMilliC "$root/status.json")" = null ] || fail "telemetry should report null temp on invalid reading"

        # --- Three consecutive invalid readings escalate to max PWM
        mk_tree "$root"; echo garbage > "$root/class/thermal/thermal_zone5/temp"
        run_loop "$root" 3
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 255 ] || fail "3 invalid readings should escalate to 255"

        # --- Implausible numeric readings (0, negative, >120C) are invalid
        for bad in 0 -22000 130000; do
          mk_tree "$root"; echo "$bad" > "$root/class/thermal/thermal_zone5/temp"
          run_loop "$root" 1
          [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 100 ] || fail "implausible reading $bad must not change pwm"
        done

        # --- Ambiguity: two hwmons with the same name fail loudly
        mk_tree "$root"
        mkdir -p "$root/class/hwmon/hwmon9"
        echo mockfan > "$root/class/hwmon/hwmon9/name"
        echo 65000 > "$root/class/thermal/thermal_zone5/temp"
        if run_loop "$root" 1 2>err.log; then
          fail "duplicate hwmon names should exit non-zero"
        fi
        grep -q "multiple hwmon devices" err.log || fail "ambiguity error should name the conflict"
        [ "$(jq -r .state "$root/status.json")" = ambiguous-hwmon ] || fail "ambiguity should surface in telemetry"

        # --- No matching hwmon -> clean no-op (fanless contract)
        mk_tree "$root"
        echo otherfan > "$root/class/hwmon/hwmon7/name"
        run_loop "$root" 1 || fail "missing hwmon must be a clean no-op exit"
        [ "$(jq -r .state "$root/status.json")" = no-fan-hardware ] || fail "fanless state should surface in telemetry"

        # --- hwmon without pwm1 -> clean no-op
        mk_tree "$root"
        rm "$root/class/hwmon/hwmon7/pwm1"
        run_loop "$root" 1 || fail "missing pwm1 must be a clean no-op exit"
        [ "$(jq -r .state "$root/status.json")" = no-pwm-control ] || fail "no-pwm state should surface in telemetry"

        # --- Missing thermal zone with fan present -> failure (restart budget path)
        mk_tree "$root"
        echo wrong-thermal > "$root/class/thermal/thermal_zone5/type"
        if run_loop "$root" 1; then
          fail "missing temp source with a real fan should fail"
        fi

        # --- rpm is null without a tach
        mk_tree "$root"; echo 65000 > "$root/class/thermal/thermal_zone5/temp"
        rm "$root/class/hwmon/hwmon7/fan1_input"
        run_loop "$root" 1
        [ "$(jq -r .rpm "$root/status.json")" = null ] || fail "rpm should be null without fan1_input"

        # --- Telemetry failure never stops control
        mk_tree "$root"; echo 65000 > "$root/class/thermal/thermal_zone5/temp"
        KORRI_FAN_SYSFS_ROOT="$root" KORRI_FAN_MAX_ITERATIONS=1 \
          KORRI_FAN_STATUS_FILE=/nonexistent-dir/status.json "$loop" \
          || fail "unwritable telemetry must not fail the loop"
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 179 ] || fail "pwm must still be written when telemetry fails"

        # --- hwmon-channel temp source resolves on the fan hwmon itself
        mk_tree "$root"
        echo 65000 > "$root/class/hwmon/hwmon7/temp1_input"
        KORRI_FAN_SYSFS_ROOT="$root" KORRI_FAN_MAX_ITERATIONS=1 \
          KORRI_FAN_STATUS_FILE="$root/status.json" "$channel_loop"
        # channel fixture uses the generic default curve: 65C between
        # 60C(50% -> 128) and 75C(75% -> 191): 128 + 63*5000/15000 = 149.
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1")" = 149 ] || fail "hwmon-channel source should drive generic-curve pwm 149, got $(cat "$root/class/hwmon/hwmon7/pwm1")"
        [ "$(jq -r .profile "$root/status.json")" = channel-profile ] || fail "channel fixture profile mismatch"

        # --- Restore script returns the fan to automatic mode
        mk_tree "$root"
        echo 1 > "$root/class/hwmon/hwmon7/pwm1_enable"
        KORRI_FAN_SYSFS_ROOT="$root" "$restore"
        [ "$(cat "$root/class/hwmon/hwmon7/pwm1_enable")" = 2 ] || fail "restore should set pwm_enable=2"

        # --- Restore is a safe no-op when the hwmon vanished
        rm -rf "$root"
        mkdir -p "$root/class/hwmon"
        KORRI_FAN_SYSFS_ROOT="$root" "$restore" || fail "restore must not fail when hwmon is absent"

        mkdir -p "$out"
        cat > "$out/summary.txt" <<'SUMMARY'
        Korri fan-control module eval invariants and behavioral scenarios passed.
        SUMMARY
      '';
in
if failures != [ ] then
  throw "Korri fan-control module check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  behavioralCheck
