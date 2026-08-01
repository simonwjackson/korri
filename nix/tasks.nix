# Korri task definitions. Runnable apps and generated help derive from the
# same definitions so the command surface cannot drift from its documentation.
{ pkgs, proseql }:
let
  proseqlSource = import ../services/korrid/proseql-source.nix { inherit pkgs proseql; };
  android = import ../clients/android/sdk.nix { inherit pkgs; };

  rustToolchain = pkgs.rust-bin.stable.latest.default.override {
    targets = [ "aarch64-linux-android" ];
  };

  retroarch = import ../runtimes/retroarch/sdk.nix { inherit pkgs; };

  androidInputs = [
    android.jdk
    android.androidSdk
    pkgs.coreutils
    pkgs.file
    pkgs.git
    pkgs.gnumake
    pkgs.unzip
    pkgs.which
  ];
  androidEnv = {
    JAVA_HOME = "${android.jdk}";
    GRADLE_OPTS = android.gradleOpts;
    KORRI_ANDROID_SDK_NAME = "android";
    KORRI_NIX_SDK = android.sdkRoot;
    KORRI_NDK_VERSION = android.ndkVersion;
  };
  androidSetup = ''
    # shellcheck source=/dev/null
    source "$KORRI_ROOT/nix/android-sdk-env.sh"
  '';

  retroarchInputs = [
    retroarch.jdk
    retroarch.androidSdk
    pkgs.cmake
    pkgs.coreutils
    pkgs.diffutils
    pkgs.file
    pkgs.git
    pkgs.gnugrep
    pkgs.gnumake
    pkgs.gnused
    pkgs.ninja
    pkgs.unzip
    pkgs.which
  ];
  retroarchEnv = {
    JAVA_HOME = "${retroarch.jdk}";
    GRADLE_OPTS = retroarch.gradleOpts;
    KORRI_ANDROID_SDK_NAME = "retroarch";
    KORRI_NIX_SDK = retroarch.sdkRoot;
    KORRI_NDK_VERSION = retroarch.ndkVersion;
  };
  retroarchSetup = ''
    # shellcheck source=/dev/null
    source "$KORRI_ROOT/nix/android-sdk-env.sh"
  '';

  adbPreflight = ''
    if [[ "$serial" == *:* ]]; then
      timeout 15 adb connect "$serial" >/dev/null || true
    fi
    if ! timeout 15 adb -s "$serial" wait-for-device; then
      echo "Android target is not reachable: $serial" >&2
      exit 1
    fi
  '';

  deviceScript =
    name: file: task:
    task
    // {
      usageSuffix = task.usageSuffix or " -- <adb-serial>";
      runtimeInputs = [
        pkgs.android-tools
        pkgs.coreutils
      ] ++ (task.runtimeInputs or [ ]);
      script = ''
        serial="''${1:?usage: ${name} <adb-serial>}"
        ${adbPreflight}
        ${task.setup or ""}
        exec "$KORRI_ROOT/services/korrid/${file}" "$@"
      '';
    };

  definitions = {
    android-apk = {
      description = "Build the debug Android APK (run portal-bundle first for bundled assets).";
      runtimeInputs = androidInputs;
      env = androidEnv;
      script = ''
        ${androidSetup}
        cd "$KORRI_ROOT/clients/android"
        exec ./gradlew assembleDebug "$@"
      '';
    };

    android-apk-dev = {
      description = "Build the debug APK against a live portal URL.";
      runtimeInputs = androidInputs;
      env = androidEnv;
      usageSuffix = " -- <portal-url>";
      script = ''
        url="''${1:?usage: android-apk-dev <portal-url>}"
        shift
        ${androidSetup}
        cd "$KORRI_ROOT/clients/android"
        exec ./gradlew assembleDebug "-PkorriPortalUrl=$url" "$@"
      '';
    };

    korrid-check = {
      description = "Run the full host, contracts, portal, and Android check.";
      needsProseql = true;
      runtimeInputs = [ pkgs.nix ];
      env.KORRI_PORTAL_BUNDLE = "${packages.portal-bundle}/bin/portal-bundle";
      script = ''
        exec "$KORRI_ROOT/services/korrid/check.sh" "$@"
      '';
    };

    korrid-config-review = {
      description = "Explain fixed local config initialization, checkpoint load, and last-known-good retention.";
      needsProseql = true;
      runtimeInputs = [
        rustToolchain
        pkgs.clang
        pkgs.llvmPackages.libclang
      ];
      env = {
        CC_x86_64_unknown_linux_gnu = "${pkgs.clang}/bin/clang";
        HOST_CC = "${pkgs.clang}/bin/clang";
        LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      };
      usageSuffix = " -- [storage-root]";
      script = ''
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        export KORRI_CONFIG_REVIEW_IN_SHELL=1
        exec "$KORRI_ROOT/services/korrid/config-snapshot-review.sh" "$@"
      '';
    };

    korrid-plugin-review = {
      description = "Explain the enabled and disabled local announcements for a plugin.";
      needsProseql = true;
      runtimeInputs = [
        rustToolchain
        pkgs.clang
        pkgs.llvmPackages.libclang
      ];
      env = {
        CC_x86_64_unknown_linux_gnu = "${pkgs.clang}/bin/clang";
        HOST_CC = "${pkgs.clang}/bin/clang";
        LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      };
      usageSuffix = " -- [plugin.ts]";
      script = ''
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        export KORRI_PLUGIN_REVIEW_IN_SHELL=1
        exec "$KORRI_ROOT/services/korrid/plugin-registry-review.sh" "$@"
      '';
    };

    korrid-plugin-route-review = {
      description = "Explain enabled and disabled checkpoint route resolution without Android effects.";
      needsProseql = true;
      runtimeInputs = [
        rustToolchain
        pkgs.clang
        pkgs.llvmPackages.libclang
      ];
      env = {
        CC_x86_64_unknown_linux_gnu = "${pkgs.clang}/bin/clang";
        HOST_CC = "${pkgs.clang}/bin/clang";
        LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      };
      usageSuffix = " -- [storage-root]";
      script = ''
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        export KORRI_PLUGIN_ROUTE_REVIEW_IN_SHELL=1
        exec "$KORRI_ROOT/services/korrid/plugin-route-review.sh" "$@"
      '';
    };

    korrid-check-device = {
      description = "Run the full korrid check, then install and smoke-test it on Android.";
      needsProseql = true;
      runtimeInputs = [
        pkgs.android-tools
        pkgs.coreutils
        pkgs.nix
      ];
      env.KORRI_PORTAL_BUNDLE = "${packages.portal-bundle}/bin/portal-bundle";
      script = ''
        serial="''${KORRI_ANDROID_DEVICE:-100.65.66.40:39991}"
        ${adbPreflight}
        export KORRI_ANDROID_DEVICE="$serial"
        exec "$KORRI_ROOT/services/korrid/check.sh" --device
      '';
    };

    korrid-script-device = {
      description = "Run the example TypeScript plugin on an Android device.";
      needsProseql = true;
      runtimeInputs = [
        rustToolchain
        pkgs.android-tools
        pkgs.cargo-ndk
        pkgs.clang
        pkgs.coreutils
        pkgs.gnugrep
        pkgs.llvmPackages.libclang
      ];
      env = {
        ANDROID_NDK_HOME = android.ndkRoot;
        ANDROID_NDK_ROOT = android.ndkRoot;
        BINDGEN_EXTRA_CLANG_ARGS = "--target=aarch64-linux-android21 --sysroot=${android.ndkRoot}/toolchains/llvm/prebuilt/linux-x86_64/sysroot";
        CC_x86_64_unknown_linux_gnu = "${pkgs.clang}/bin/clang";
        HOST_CC = "${pkgs.clang}/bin/clang";
        LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      };
      usageSuffix = " -- <adb-serial>";
      script = ''
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        exec "$KORRI_ROOT/services/korrid/script-device-check.sh" "$@"
      '';
    };

    brain-service-check = deviceScript "brain-service-check" "brain-service-check.sh" {
      description = "Check on a device that the embedded korrid brain survives after the portal screen leaves foreground.";
      runtimeInputs = [ pkgs.gnugrep ];
    };

    storage-notice-check = deviceScript "storage-notice-check" "storage-notice-check.sh" {
      description = "Build, install, and verify on a device that denied storage access shows a reachable portal prompt.";
      needsProseql = true;
      runtimeInputs = androidInputs ++ [
        rustToolchain
        pkgs.android-tools
        pkgs.cargo-ndk
        pkgs.clang
        pkgs.gnugrep
        pkgs.nix
        pkgs.llvmPackages.libclang
      ];
      env = androidEnv // {
        ANDROID_NDK_HOME = android.ndkRoot;
        ANDROID_NDK_ROOT = android.ndkRoot;
        BINDGEN_EXTRA_CLANG_ARGS = "--target=aarch64-linux-android21 --sysroot=${android.ndkRoot}/toolchains/llvm/prebuilt/linux-x86_64/sysroot";
        CC_x86_64_unknown_linux_gnu = "${pkgs.clang}/bin/clang";
        HOST_CC = "${pkgs.clang}/bin/clang";
        LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      };
      setup = ''
        ${androidSetup}
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
      '';
    };

    storage-notice-shots = deviceScript "storage-notice-shots" "storage-notice-shots.sh" {
      description = "Capture device screenshots of the portal with storage access denied and after confirming the prompt.";
      usageSuffix = " -- <adb-serial> [output-dir]";
      runtimeInputs = [ pkgs.gnugrep ];
    };

    journey-compare = deviceScript "journey-compare" "journey-compare.sh" {
      description = "Compare the Android game journey after leaving with Back versus Home, reporting resume/restart evidence.";
      runtimeInputs = [
        pkgs.gnugrep
        pkgs.gnused
      ];
    };

    journey-resume = deviceScript "journey-resume" "journey-resume.sh" {
      description = "Verify on a device that leaving an Android game with Back and relaunching resumes the same process on screen.";
      usageSuffix = " -- <adb-serial> [package] [tap-x tap-y]";
      runtimeInputs = [
        pkgs.gnugrep
        pkgs.gnused
      ];
    };

    journey-switch = deviceScript "journey-switch" "journey-switch.sh" {
      description = "Report what appears when the user opens Korri again after switching away from an Android game with Home.";
      usageSuffix = " -- <adb-serial> [label]";
      runtimeInputs = [
        pkgs.gnugrep
        pkgs.gnused
      ];
    };

    launch-liveness-check = deviceScript "launch-liveness-check" "launch-liveness-check.sh" {
      description = "Measure whether pid, process state, and Android tasks truthfully identify an Android game launch as alive.";
      runtimeInputs = [
        pkgs.gawk
        pkgs.gnugrep
      ];
    };

    korrid-test = {
      description = "Run the korrid host test suite.";
      needsProseql = true;
      runtimeInputs = [
        rustToolchain
        pkgs.clang
        pkgs.llvmPackages.libclang
      ];
      env.LIBCLANG_PATH = "${pkgs.llvmPackages.libclang.lib}/lib";
      script = ''
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        cd "$KORRI_ROOT/services/korrid"
        exec cargo test "$@"
      '';
    };

    portal-bundle = {
      description = "Build the portal into the Android app assets.";
      runtimeInputs = [
        pkgs.bun
        pkgs.coreutils
      ];
      script = ''
        cd "$KORRI_ROOT/clients/portal"
        bun run build
        rm -rf "$KORRI_ROOT/clients/android/app/src/main/assets/portal"
        cp -r dist "$KORRI_ROOT/clients/android/app/src/main/assets/portal"
      '';
    };

    portal-check = {
      description = "Run portal unit tests and typecheck.";
      runtimeInputs = [ pkgs.bun ];
      script = ''
        cd "$KORRI_ROOT/clients/portal"
        bun test
        bun run typecheck
      '';
    };

    portal-dev = {
      description = "Serve the portal on the local network.";
      runtimeInputs = [ pkgs.bun ];
      script = ''
        cd "$KORRI_ROOT/clients/portal"
        exec bun run dev "$@"
      '';
    };

    ra-accept = {
      description = "Build, deploy, and run RetroArch acceptance on Android.";
      runtimeInputs = [
        pkgs.android-tools
        pkgs.coreutils
        pkgs.curl
        pkgs.gnugrep
        pkgs.gnused
      ];
      usageSuffix = " -- <adb-serial>";
      script = ''
        serial="''${1:?usage: ra-accept <adb-serial>}"
        shift
        ${packages.ra-deploy}/bin/ra-deploy "$serial"
        exec ${pkgs.bash}/bin/bash "$KORRI_ROOT/runtimes/retroarch/device-acceptance.sh" "$serial" "$@"
      '';
    };

    ra-build = {
      description = "Build and validate the patched arm64 RetroArch runtime.";
      runtimeInputs = retroarchInputs;
      env = retroarchEnv;
      script = ''
        ${retroarchSetup}
        exec "$KORRI_ROOT/runtimes/retroarch/build.sh" "$@"
      '';
    };

    ra-check = {
      description = "Test the RetroArch lifecycle and build a fresh APK.";
      runtimeInputs = [
        pkgs.coreutils
        pkgs.git
        pkgs.gnugrep
        pkgs.gnused
      ];
      script = ''
        "$KORRI_ROOT/runtimes/retroarch/test-fetch-upstream.sh"
        "$KORRI_ROOT/runtimes/retroarch/test-build.sh"
        "$KORRI_ROOT/runtimes/retroarch/test-install-device.sh"
        exec ${packages.ra-build}/bin/ra-build
      '';
    };

    ra-core-mgba = {
      description = "Build and stage the pinned arm64 mGBA libretro core.";
      runtimeInputs = retroarchInputs;
      env = retroarchEnv;
      script = ''
        ${packages.ra-fetch}/bin/ra-fetch
        ${retroarchSetup}
        exec "$KORRI_ROOT/runtimes/retroarch/cores/mgba/build.sh" "$@"
      '';
    };

    ra-deploy = {
      description = "Build, validate, and install the RetroArch fork on Android.";
      runtimeInputs = retroarchInputs ++ [ pkgs.android-tools ];
      env = retroarchEnv;
      usageSuffix = " -- <adb-serial>";
      script = ''
        serial="''${1:?usage: ra-deploy <adb-serial>}"
        shift
        ${adbPreflight}
        ${packages.ra-build}/bin/ra-build
        ${retroarchSetup}
        exec "$KORRI_ROOT/runtimes/retroarch/install-device.sh" "$serial" "$@"
      '';
    };

    ra-fetch = {
      description = "Recreate the pinned, patched RetroArch source tree.";
      runtimeInputs = [
        pkgs.coreutils
        pkgs.git
      ];
      script = ''
        exec "$KORRI_ROOT/runtimes/retroarch/fetch-upstream.sh" "$@"
      '';
    };
  };

  exports = pkgs.lib.mapAttrs (
    _: task:
    pkgs.lib.concatStringsSep "\n" (
      pkgs.lib.mapAttrsToList (name: value: ''export ${name}="${value}"'') (task.env or { })
    )
  ) definitions;

  makeTask =
    name: task:
    pkgs.writeShellApplication {
      inherit name;
      runtimeInputs = [
        pkgs.bash
        pkgs.coreutils
        pkgs.git
      ]
      ++ task.runtimeInputs;
      text = ''
        if [[ -n "''${KORRI_ROOT:-}" ]]; then
          korri_root="$KORRI_ROOT"
        else
          korri_root="$PWD"
          while [[ "$korri_root" != / && ! -f "$korri_root/nix/tasks.nix" ]]; do
            korri_root="$(dirname "$korri_root")"
          done
        fi
        if [[ ! -f "$korri_root/flake.nix" || ! -f "$korri_root/nix/tasks.nix" ]]; then
          echo "Korri checkout not found; run inside it or set KORRI_ROOT" >&2
          exit 1
        fi
        KORRI_ROOT="$(cd "$korri_root" && pwd -P)"
        export KORRI_ROOT
        ${pkgs.lib.optionalString (task.needsProseql or false) proseqlSource.hydrateShell}
        ${exports.${name}}
        ${task.script}
      '';
    };

  packages = pkgs.lib.mapAttrs makeTask definitions;

  helpText = pkgs.lib.concatStringsSep "\n" (
    pkgs.lib.mapAttrsToList (
      name: task: "  nix run .#${name}${task.usageSuffix or ""}\n      ${task.description}"
    ) definitions
  );

  help = pkgs.writeShellApplication {
    name = "help";
    runtimeInputs = [ ];
    text = ''
      cat <<'EOF'
      Korri tasks (declared in nix/tasks.nix):

      ${helpText}
      EOF
    '';
  };

  toApp = package: {
    type = "app";
    program = "${package}/bin/${package.name}";
  };
in
(pkgs.lib.mapAttrs (_: package: toApp package) packages)
// {
  help = toApp help;
  default = toApp help;
}
