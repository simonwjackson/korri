# RetroArch (upstream v1.22.2) Android build toolchain. RA's phoenix project
# pins AGP 4.2.0 / Gradle 6.7.1 / compileSdk 30 / buildTools 30.0.3 /
# NDK 22.0.7026061 — all older than clients/android's shell, hence a
# dedicated composition. Expects pkgs imported with
# android_sdk.accept_license = true and allowUnfree = true.
{ pkgs }:
let
  android = import ./sdk.nix { inherit pkgs; };
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    android.jdk
    gnumake
    cmake
    ninja
    git
    which
    file
    unzip
  ];

  JAVA_HOME = android.jdk;
  # NixOS cannot run Gradle's downloaded dynamically linked aapt2; use the
  # Nix-provided one (same pattern as clients/android).
  GRADLE_OPTS = android.gradleOpts;

  shellHook = ''
    export KORRI_NIX_SDK="${android.sdkRoot}"
    export KORRI_NDK_VERSION="${android.ndkVersion}"
    export KORRI_ANDROID_SDK_NAME="retroarch"
    export KORRI_ROOT="''${KORRI_ROOT:-$(git rev-parse --show-toplevel)}"
    # shellcheck source=/dev/null
    source ${../../nix/android-sdk-env.sh} || exit 1

    echo "RetroArch Android build environment"
    echo "  JAVA_HOME:  $JAVA_HOME"
    echo "  SDK:        $ANDROID_HOME"
    echo "  NDK:        $ANDROID_NDK_ROOT"
    echo "  Build: cd upstream/pkg/android/phoenix && ./gradlew assembleAarch64Release"
  '';
}
