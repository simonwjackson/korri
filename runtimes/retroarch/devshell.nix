# RetroArch (upstream v1.22.2) Android build toolchain. RA's phoenix project
# pins AGP 4.2.0 / Gradle 6.7.1 / compileSdk 30 / buildTools 30.0.3 /
# NDK 22.0.7026061 — all older than clients/android's shell, hence a
# dedicated composition. Expects pkgs imported with
# android_sdk.accept_license = true and allowUnfree = true.
{ pkgs }:
let
  buildToolsVersion = "30.0.3";
  ndkVersion = "22.0.7026061";

  androidComposition = pkgs.androidenv.composeAndroidPackages {
    buildToolsVersions = [ buildToolsVersion ];
    platformVersions = [ "30" ];
    ndkVersions = [ ndkVersion ];
    includeEmulator = false;
    includeSystemImages = false;
    includeSources = false;
    includeNDK = true;
    extraLicenses = [
      "android-sdk-license"
      "android-sdk-preview-license"
    ];
  };

  androidSdk = androidComposition.androidsdk;
  # AGP 4.2 / Gradle 6.7.1 want JDK 11 (JDK 17 breaks them).
  pinnedJDK = pkgs.jdk11;
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    pinnedJDK
    gnumake
    cmake
    ninja
    git
    which
    file
    unzip
  ];

  JAVA_HOME = pinnedJDK;
  # NixOS cannot run Gradle's downloaded dynamically linked aapt2; use the
  # Nix-provided one (same pattern as clients/android).
  GRADLE_OPTS = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/libexec/android-sdk/build-tools/${buildToolsVersion}/aapt2";

  shellHook = ''
    NIX_SDK="${androidSdk}/libexec/android-sdk"
    SDK_DIR="$PWD/.android-sdk"

    if [ ! -d "$SDK_DIR" ] || [ ! -e "$SDK_DIR/ndk/${ndkVersion}" ]; then
      echo "Setting up local Android SDK symlinks (RA toolchain)..."
      rm -rf "$SDK_DIR"
      mkdir -p "$SDK_DIR"

      for item in "$NIX_SDK"/*; do
        name=$(basename "$item")
        if [ "$name" != "ndk-bundle" ] && [ "$name" != "licenses" ]; then
          ln -sf "$item" "$SDK_DIR/$name"
        fi
      done

      # AGP looks for sdk/ndk/<version>; androidenv exposes ndk-bundle.
      mkdir -p "$SDK_DIR/ndk"
      if [ -d "$NIX_SDK/ndk-bundle" ]; then
        ln -sf "$NIX_SDK/ndk-bundle" "$SDK_DIR/ndk/${ndkVersion}"
      fi

      # Licenses must be real files, not symlinks into the store.
      mkdir -p "$SDK_DIR/licenses"
      if [ -d "$NIX_SDK/licenses" ]; then
        for license in "$NIX_SDK/licenses"/*; do
          cat "$license" > "$SDK_DIR/licenses/$(basename "$license")"
        done
      fi

      echo "SDK setup complete."
    fi

    export ANDROID_HOME="$SDK_DIR"
    export ANDROID_SDK_ROOT="$SDK_DIR"
    export ANDROID_NDK_ROOT="$SDK_DIR/ndk/${ndkVersion}"
    export PATH="$ANDROID_SDK_ROOT/platform-tools:$PATH"

    echo "RetroArch Android build environment"
    echo "  JAVA_HOME:  $JAVA_HOME"
    echo "  SDK:        $ANDROID_HOME"
    echo "  NDK:        $ANDROID_NDK_ROOT"
    echo "  Build: cd upstream/pkg/android/phoenix && ./gradlew assembleAarch64Release"
  '';
}
