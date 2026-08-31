{
  pkgs,
  system,
  inputplumberNixpkgs,
  crane,
  korriBundleModule,
  korriInputModule,
  korridLinuxDeviceModule,
  korriLinuxHostModule,
  korridPackage,
  sunshinePackage,
}:

let
  inputplumberPkgs = import inputplumberNixpkgs { inherit system; };
  inputplumberRuntime = pkgs.callPackage ./inputplumber-package.nix {
    inputplumber = inputplumberPkgs.inputplumber;
  };
  inputplumberData = import ./inputplumber-data.nix { inherit pkgs; };
  inputplumberKorri = inputplumberData.compose { inherit inputplumberRuntime; };
  retroarchInputplumberAutoconfig = pkgs.callPackage ./retroarch-inputplumber-autoconfig.nix { };
  sunshineApprovedPatches = import ../../sunshine/approved-patches.nix;
  sunshinePatchPaths = map (record: record.path) sunshineApprovedPatches.patches;
  androidMoonlightRoot = ../../../clients/android/app/src/main/jni/moonlight-core/moonlight-common-c/src;
  inputdPackage = import ../package.nix { inherit pkgs crane; };
  devApp = import ./dev-app.nix {
    inherit pkgs inputdPackage korridPackage;
  };
  korriBundle = import ./korri-bundle.nix {
    inherit
      pkgs
      inputdPackage
      inputplumberKorri
      korridPackage
      ;
  };
  toApp = package: {
    type = "app";
    program = "${package}/bin/${package.name}";
  };
in
{
  apps = {
    korri-dev = toApp devApp;
    korri-bundle-select = {
      type = "app";
      program = "${inputdPackage}/bin/korri-bundle-select";
    };
  };
  packages = {
    inputplumber-korri = inputplumberKorri;
    retroarch-inputplumber-autoconfig = retroarchInputplumberAutoconfig;
    korri-inputd = inputdPackage;
    korri-bundle = korriBundle;
    sunshine-korri = sunshinePackage;
  };
  checks = {
    sunshine-korri-package = pkgs.runCommand "sunshine-korri-package-check" { } ''
      test -x ${sunshinePackage}/bin/sunshine
      test "${sunshinePackage.pname}" = sunshine-korri
      test "${sunshinePackage.version}" = "${pkgs.sunshine.version}-korri"
      test "${toString (builtins.length sunshinePackage.korriPatchNames)}" = 10
      test "${sunshinePackage.korriBaseSunshineVersion}" = "${sunshineApprovedPatches.baseSunshineVersion}"
      test "${sunshinePackage.korriApprovedBaseSunshineSourceHash}" = "${sunshineApprovedPatches.approvedBaseSourceHash}"
      test "${pkgs.sunshine.src.outputHash}" = "${sunshineApprovedPatches.approvedBaseSourceHash}"
      test "${sunshinePackage.korriBaseSunshineSource}" = "${builtins.unsafeDiscardStringContext (toString pkgs.sunshine.src)}"
      test "${sunshinePackage.korriBaseSunshineDerivation}" = "${builtins.unsafeDiscardStringContext pkgs.sunshine.drvPath}"
      test "${sunshinePackage.korriReviewedLibavcodecVersion}" = "${sunshineApprovedPatches.reviewedLibavcodecVersion}"
      test "${sunshinePackage.korriPatchSetSha256}" = "${sunshineApprovedPatches.patchSetSha256}"
      provenance=${sunshinePackage}/${sunshinePackage.korriProvenanceRelativePath}
      test -f "$provenance"
      grep -Fx 'package=sunshine-korri' "$provenance" >/dev/null
      grep -Fx 'approved_base_sunshine_source_hash=${sunshineApprovedPatches.approvedBaseSourceHash}' "$provenance" >/dev/null
      grep -Fx 'executable=bin/sunshine' "$provenance" >/dev/null
      grep -Fx 'patch_set_sha256=${sunshinePackage.korriPatchSetSha256}' "$provenance" >/dev/null
      touch "$out"
    '';
    sunshine-korri-runtime-settings = import ../../sunshine/runtime-settings-check.nix {
      inherit pkgs sunshinePackage;
      approvedPatchesPath = ../../sunshine/approved-patches.nix;
      patchPaths = sunshinePatchPaths;
      packagePath = ../../sunshine/package.nix;
      readmePath = ../../sunshine/README.md;
    };
    sunshine-korri-input-seat-patch = import ../../sunshine/input-seat-patch-check.nix {
      inherit pkgs sunshinePackage;
      approvedPatchesPath = ../../sunshine/approved-patches.nix;
      nonblockingTestPath = ../../sunshine/test-nonblocking-mirror.py;
      patchPath = ../../sunshine/patches/0015-add-korri-input-seat-event-mirror.patch;
      packagePath = ../../sunshine/package.nix;
      readmePath = ../../sunshine/README.md;
    };
    sunshine-korri-android-client-protocol = import ../../sunshine/android-client-protocol-check.nix {
      inherit pkgs;
      sunshinePatchPath = ../../sunshine/patches/0001-add-runtime-settings-protocol-surface.patch;
      clientHeaderPath = androidMoonlightRoot + "/Limelight.h";
      clientInternalHeaderPath = androidMoonlightRoot + "/SunshineRuntimeSettings.h";
      clientProtocolPath = androidMoonlightRoot + "/SunshineRuntimeSettings.c";
      clientDispatchPath = androidMoonlightRoot + "/SunshineRuntimeSettingsDispatch.c";
      clientControlStreamPath = androidMoonlightRoot + "/ControlStream.c";
      clientConnectionPath = androidMoonlightRoot + "/Connection.c";
      clientJniPath = ../../../clients/android/app/src/main/jni/moonlight-core/simplejni.c;
      clientJavaPath = ../../../clients/android/app/src/main/java/com/limelight/nvstream/jni/MoonBridge.java;
      clientSnapshotJavaPath = ../../../clients/android/app/src/main/java/com/limelight/nvstream/jni/SunshineRuntimeSettingsSnapshot.java;
      nativeTestPath = ../../../clients/android/app/src/test-native/sunshine-runtime-settings-test.c;
    };
    inputplumber-korri-package = import ./inputplumber-package-check.nix {
      inherit
        pkgs
        inputplumberRuntime
        inputplumberKorri
        retroarchInputplumberAutoconfig
        ;
    };
    korri-inputd-package = pkgs.runCommand "korri-inputd-package-check" { } ''
      test -x ${inputdPackage}/bin/korri-inputd
      test -x ${inputdPackage}/bin/korri-bundle-launch
      test -x ${inputdPackage}/bin/korri-bundle-select
      test -x ${inputdPackage}/bin/korri-device-gate
      test "$(sha256sum ${inputdPackage}/bin/korri-device-gate | cut -d' ' -f1)" = \
        "$(sha256sum ${../deploy/device-check.sh} | cut -d' ' -f1)"
      grep -Fx "EXPECTED_SUNSHINE_PATCH_SET_SHA256='${sunshineApprovedPatches.patchSetSha256}'" \
        ${inputdPackage}/bin/korri-device-gate >/dev/null
      test -x ${devApp}/bin/korri-dev
      grep -F 'KORRI_INPUTD_PROFILE=development' ${devApp}/bin/korri-dev >/dev/null
      grep -F 'KORRI_INPUTD_SOURCE="$physical_input"' ${devApp}/bin/korri-dev >/dev/null
      test "$(readlink -f ${korriBundle}/bin/inputplumber)" = ${inputplumberKorri}/bin/inputplumber
      test "$(readlink -f ${korriBundle}/bin/korri-inputd)" = ${inputdPackage}/bin/korri-inputd
      test "$(readlink -f ${korriBundle}/bin/korrid)" = ${korridPackage}/bin/korrid
      test "$(readlink -f ${korriBundle}/share/inputplumber)" = ${inputplumberKorri}/share/inputplumber
      test "$(readlink -f ${korriBundle}/share/korri-input-profile)" = \
        ${inputplumberKorri}/share/inputplumber/profiles/${inputplumberData.resolvedProfile}
      touch "$out"
    '';
    korri-input-module = import ./korri-input-module-check.nix {
      module = korriInputModule;
      bundleModule = korriBundleModule;
      inherit pkgs inputdPackage inputplumberKorri;
    };
    korri-bundle-module = import ./korri-bundle-module-check.nix {
      inherit
        pkgs
        korriBundleModule
        korriInputModule
        korridLinuxDeviceModule
        inputdPackage
        inputplumberKorri
        korridPackage
        korriBundle
        ;
    };
    korrid-linux-device-module = import ../../korrid/nixos-module-check.nix {
      module = korridLinuxDeviceModule;
      bundleModule = korriBundleModule;
      inherit
        pkgs
        korridPackage
        inputdPackage
        korriBundle
        ;
    };
    korri-linux-host-module = import ./korri-linux-host-module-check.nix {
      module = korriLinuxHostModule;
      inherit
        pkgs
        sunshinePackage
        inputdPackage
        inputplumberKorri
        korridPackage
        korriBundle
        ;
    };
  };
}
