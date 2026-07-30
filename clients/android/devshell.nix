# Android (Artemis) toolchain. Owned by clients/android; composed by the
# root flake as devShells.<system>.android. Expects pkgs imported with
# android_sdk.accept_license = true and allowUnfree = true.
{ pkgs }:
let
  android = import ./sdk.nix { inherit pkgs; };
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    android.jdk
    android.androidSdk
    gradle
    gnumake
    git
    which
    file
  ];

  JAVA_HOME = android.jdk;
  # aapt2FromMavenOverride: NixOS cannot run Gradle's downloaded dynamically
  # linked aapt2; use the Nix-provided one (same pattern as hiper).
  GRADLE_OPTS = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${android.sdkRoot}/build-tools/${android.buildToolsVersion}/aapt2";

  shellHook = ''
    export KORRI_NIX_SDK="${android.sdkRoot}"
    export KORRI_NDK_VERSION="${android.ndkVersion}"
    export KORRI_ROOT="$(git rev-parse --show-toplevel)"
    # shellcheck source=/dev/null
    source ${./sdk-env.sh}

    echo ""
    echo "Korri Android Development Environment"
    echo "====================================="
    echo "ANDROID_HOME: $ANDROID_HOME"
    echo "ANDROID_NDK_ROOT: $ANDROID_NDK_ROOT"
    echo "JAVA_HOME: $JAVA_HOME"
    echo ""
    echo "Build commands:"
    echo "  ./gradlew assembleDebug    - Build debug APK"
    echo "  ./gradlew assembleRelease  - Build release APK"
    echo "  ./gradlew test             - Run tests"
    echo ""
  '';
}
