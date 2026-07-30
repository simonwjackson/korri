# Korri task definitions. Runnable apps and generated help derive from the
# same definitions so the command surface cannot drift from its documentation.
{ pkgs }:
let
  android = import ../clients/android/sdk.nix { inherit pkgs; };

  rustToolchain = pkgs.rust-bin.stable.latest.default.override {
    targets = [ "aarch64-linux-android" ];
  };

  retroarchBuildToolsVersion = "30.0.3";
  retroarchNdkVersion = "22.0.7026061";
  retroarchComposition = pkgs.androidenv.composeAndroidPackages {
    buildToolsVersions = [ retroarchBuildToolsVersion ];
    platformVersions = [ "30" ];
    ndkVersions = [ retroarchNdkVersion ];
    includeEmulator = false;
    includeSystemImages = false;
    includeSources = false;
    includeNDK = true;
    extraLicenses = [
      "android-sdk-license"
      "android-sdk-preview-license"
    ];
  };
  retroarchSdk = retroarchComposition.androidsdk;
  retroarchSdkRoot = "${retroarchSdk}/libexec/android-sdk";
  retroarchJdk = pkgs.jdk11;

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
    GRADLE_OPTS = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${android.sdkRoot}/build-tools/${android.buildToolsVersion}/aapt2";
    KORRI_NIX_SDK = android.sdkRoot;
    KORRI_NDK_VERSION = android.ndkVersion;
  };
  androidSetup = ''
    # shellcheck source=/dev/null
    source "$KORRI_ROOT/clients/android/sdk-env.sh"
  '';

  retroarchInputs = [
    retroarchJdk
    retroarchSdk
    pkgs.cmake
    pkgs.coreutils
    pkgs.file
    pkgs.git
    pkgs.gnumake
    pkgs.ninja
    pkgs.unzip
    pkgs.which
  ];
  retroarchEnv = {
    JAVA_HOME = "${retroarchJdk}";
    GRADLE_OPTS = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${retroarchSdkRoot}/build-tools/${retroarchBuildToolsVersion}/aapt2";
    KORRI_NIX_SDK = retroarchSdkRoot;
    KORRI_NDK_VERSION = retroarchNdkVersion;
  };
  retroarchSetup = ''
    # shellcheck source=/dev/null
    source "$KORRI_ROOT/clients/android/sdk-env.sh"
  '';

  adbPreflight = taskName: ''
    serial="''${1:?usage: ${taskName} <adb-serial>}"
    shift
    if [[ "$serial" == *:* ]]; then
      adb connect "$serial" >/dev/null || true
    fi
    if ! timeout 15 adb -s "$serial" wait-for-device; then
      echo "Android target is not reachable: $serial" >&2
      exit 1
    fi
  '';

  definitions = {
    android-apk = {
      description = "Build the debug Android APK.";
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
      takesArgs = true;
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
      runtimeInputs = [ pkgs.nix ];
      script = ''
        exec "$KORRI_ROOT/services/korrid/check.sh" "$@"
      '';
    };

    korrid-check-device = {
      description = "Run the full korrid check, then install and smoke-test it on Android.";
      runtimeInputs = [
        pkgs.android-tools
        pkgs.coreutils
        pkgs.nix
      ];
      script = ''
        device="''${KORRI_ANDROID_DEVICE:-100.65.66.40:39991}"
        if [[ "$device" == *:* ]]; then
          adb connect "$device" >/dev/null || true
        fi
        if ! timeout 15 adb -s "$device" wait-for-device; then
          echo "Android target is not reachable: $device" >&2
          exit 1
        fi
        export KORRI_ANDROID_DEVICE="$device"
        exec "$KORRI_ROOT/services/korrid/check.sh" --device
      '';
    };

    korrid-script-device = {
      description = "Run the example TypeScript plugin on an Android device.";
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
      takesArgs = true;
      script = ''
        ${adbPreflight "korrid-script-device"}
        export CARGO_TARGET_DIR="$KORRI_ROOT/.cache/korrid-target"
        exec "$KORRI_ROOT/services/korrid/script-device-check.sh" "$serial" "$@"
      '';
    };

    korrid-test = {
      description = "Run the korrid host test suite.";
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
      takesArgs = true;
      script = ''
        serial="''${1:?usage: ra-accept <adb-serial>}"
        shift
        ${packages.ra-deploy}/bin/ra-deploy "$serial"
        exec "$KORRI_ROOT/runtimes/retroarch/device-acceptance.sh" "$serial" "$@"
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
      takesArgs = true;
      script = ''
        ${adbPreflight "ra-deploy"}
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
      runtimeInputs = [ pkgs.git ] ++ task.runtimeInputs;
      text = ''
        KORRI_ROOT="$(git rev-parse --show-toplevel)"
        export KORRI_ROOT
        ${exports.${name}}
        ${task.script}
      '';
    };

  packages = pkgs.lib.mapAttrs makeTask definitions;

  helpText = pkgs.lib.concatStringsSep "\n" (
    pkgs.lib.mapAttrsToList (
      name: task:
      "  nix run .#${name}${
          pkgs.lib.optionalString (task ? takesArgs) " -- <args>"
        }\n      ${task.description}"
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
