# RetroArch's pinned Android SDK/NDK composition, shared by its devshell and
# Nix tasks.
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
in
rec {
  inherit buildToolsVersion ndkVersion;
  androidSdk = androidComposition.androidsdk;
  sdkRoot = "${androidSdk}/libexec/android-sdk";
  jdk = pkgs.jdk11;
  gradleOpts = "-Dorg.gradle.daemon=false -Dorg.gradle.project.android.aapt2FromMavenOverride=${sdkRoot}/build-tools/${buildToolsVersion}/aapt2";
}
