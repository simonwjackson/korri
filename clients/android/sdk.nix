# Android SDK/NDK composition shared by devshells and Nix tasks.
{
  pkgs,
  platformVersions ? [
    "36"
    "34"
  ],
  includeEmulator ? false,
  includeSystemImages ? false,
  systemImageTypes ? [ "google_apis" ],
  abiVersions ? [ "x86_64" ],
}:
let
  buildToolsVersion = "35.0.0";
  ndkVersion = "27.0.12077973";

  androidComposition = pkgs.androidenv.composeAndroidPackages {
    buildToolsVersions = [
      buildToolsVersion
      "34.0.0"
    ];
    inherit platformVersions includeEmulator includeSystemImages systemImageTypes abiVersions;
    ndkVersions = [ ndkVersion ];
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
in
rec {
  inherit buildToolsVersion ndkVersion;
  androidSdk = androidComposition.androidsdk;
  sdkRoot = "${androidSdk}/libexec/android-sdk";
  # cargo-ndk needs only the NDK. Gradle uses the writable SDK farm created by
  # nix/android-sdk-env.sh because AGP expects sdk/ndk/<version>.
  ndkRoot = "${sdkRoot}/ndk-bundle";
  jdk = pkgs.jdk17;
  gradleOpts = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${sdkRoot}/build-tools/${buildToolsVersion}/aapt2";
}
