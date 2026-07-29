{
  description = "Artemis Android - Moonlight fork development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            android_sdk.accept_license = true;
            allowUnfree = true;
          };
        };

        buildToolsVersion = "35.0.0";
        ndkVersion = "27.0.12077973";

        # Android SDK configuration
        androidComposition = pkgs.androidenv.composeAndroidPackages {
          buildToolsVersions = [ buildToolsVersion "34.0.0" ];
          platformVersions = [ "36" "34" ];
          ndkVersions = [ ndkVersion ];
          includeEmulator = false;
          includeSystemImages = false;
          includeSources = false;
          includeNDK = true;
          cmakeVersions = [ "3.22.1" ];
          extraLicenses = [
            "android-googletv-license"
            "android-sdk-arm-dbt-license"
            "android-sdk-license"
            "android-sdk-preview-license"
            "google-gdk-license"
            "intel-android-extra-license"
            "intel-android-sysimage-license"
            "mips-android-sysimage-license"
          ];
        };

        androidSdk = androidComposition.androidsdk;
        pinnedJDK = pkgs.jdk17;

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            pinnedJDK
            androidSdk
            gradle
            gnumake
            git
            which
            file
          ];

          JAVA_HOME = pinnedJDK;
          # aapt2FromMavenOverride: NixOS cannot run Gradle's downloaded dynamically
          # linked aapt2; use the Nix-provided one (same pattern as hiper).
          GRADLE_OPTS = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/libexec/android-sdk/build-tools/${buildToolsVersion}/aapt2";

          shellHook = ''
            NIX_SDK="${androidSdk}/libexec/android-sdk"
            SDK_DIR="$PWD/.android-sdk"
            
            # Only setup if needed
            if [ ! -d "$SDK_DIR" ] || [ ! -L "$SDK_DIR/platforms/android-36" ]; then
              echo "Setting up local Android SDK symlinks..."
              rm -rf "$SDK_DIR"
              mkdir -p "$SDK_DIR"
              
              # Symlink all directories except platforms, ndk-bundle, and licenses
              for item in "$NIX_SDK"/*; do
                name=$(basename "$item")
                if [ "$name" != "platforms" ] && [ "$name" != "ndk-bundle" ] && [ "$name" != "licenses" ]; then
                  ln -sf "$item" "$SDK_DIR/$name"
                fi
              done
              
              # Create platforms directory with proper naming
              mkdir -p "$SDK_DIR/platforms"
              for plat in "$NIX_SDK/platforms"/*; do
                name=$(basename "$plat")
                ln -sf "$plat" "$SDK_DIR/platforms/$name"
              done
              
              # Create android-36 symlink if needed (Nix has android-36.1)
              if [ -d "$NIX_SDK/platforms/android-36.1" ] && [ ! -e "$SDK_DIR/platforms/android-36" ]; then
                ln -sf "$NIX_SDK/platforms/android-36.1" "$SDK_DIR/platforms/android-36"
              fi
              
              # Create proper ndk directory structure
              mkdir -p "$SDK_DIR/ndk"
              if [ -d "$NIX_SDK/ndk-bundle" ]; then
                ln -sf "$NIX_SDK/ndk-bundle" "$SDK_DIR/ndk/${ndkVersion}"
              fi
              
              # Create licenses directory with actual files
              mkdir -p "$SDK_DIR/licenses"
              if [ -d "$NIX_SDK/licenses" ]; then
                for license in "$NIX_SDK/licenses"/*; do
                  name=$(basename "$license")
                  cat "$license" > "$SDK_DIR/licenses/$name"
                done
              fi
              
              echo "Android SDK setup complete."
            fi
            
            export ANDROID_HOME="$SDK_DIR"
            export ANDROID_SDK_ROOT="$SDK_DIR"
            export ANDROID_NDK_ROOT="$SDK_DIR/ndk/${ndkVersion}"
            export PATH="$ANDROID_SDK_ROOT/tools:$ANDROID_SDK_ROOT/tools/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"
            
            echo ""
            echo "Artemis Android Development Environment"
            echo "========================================"
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
        };
      }
    );
}
