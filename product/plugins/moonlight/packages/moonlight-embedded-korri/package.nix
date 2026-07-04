{
  lib,
  stdenv,
  fetchFromGitHub,
  cmake,
  perl,
  pkg-config,
  alsa-lib,
  avahi,
  curl,
  expat,
  ffmpeg,
  libcec,
  libevdev,
  libpulseaudio,
  libpthreadstubs,
  libva,
  libvdpau,
  libxcb,
  libopus,
  json_c,
  SDL2,
  systemdMinimal,
  util-linux,
  libdrm,
  libglvnd,
  nix-on-rocks,
}:

let
  nixOnRocksMoonlightManifest = import "${nix-on-rocks}/packages/moonlight-embedded/manifest.nix";

  # The nix-on-rocks manifest pins its `version` to
  # `<upstream>-sm8550-v4l2m2m` to telegraph the SM8550 hardware-decode
  # patch lineage. That suffix reads as device-specific in store paths and
  # logs, but the resulting binary actually supports every platform
  # `moonlight-embedded` upstream supports — the SM8550 v4l2m2m platform
  # is opt-in via `-platform v4l2m2m`, and the SDL software-decode +
  # ffmpeg_drm paths work on any DRM-capable host (x86 desktop, aarch64
  # handhelds, anything in between). Korri ships this build as the
  # universal `pkgs.moonlight-embedded` substitute on every platform, so
  # the version string is normalised back to the upstream Moonlight
  # Embedded tag with a single `-korri` suffix. The SM8550 patch heritage
  # stays discoverable through `nix-support/moonlight-embedded-korri/`
  # manifest entries below.
  upstreamMoonlightVersion = lib.head (lib.splitString "-" nixOnRocksMoonlightManifest.version);

  # Keep the base v4l2m2m / DRM PRIME Moonlight work in nix-on-rocks. Korri
  # only carries Korri-owned patches here.
  basePatchNames = [
    "0001-vendored-ffmpeg-drm-prime-pr932.patch"
    "0001a-fix-libdrm-cmake-find-and-main-help.patch"
    "0002-add-v4l2m2m-sdl-nv12-platform.patch"
    "0003-add-env-gated-v4l2m2m-pacing-experiments.patch"
  ];

  basePatches = builtins.filter (
    patch: builtins.elem patch.name basePatchNames
  ) nixOnRocksMoonlightManifest.patches;

  # Korri-owned patches layered on top of nix-on-rocks' base Moonlight package.
  korriPatches = [
    ./patches/0004-add-absolutetouch-flag-for-tap-to-click.patch
    ./patches/0005a-add-sunshine-runtime-settings-protocol-sender.patch
    ./patches/0005b-track-sunshine-runtime-settings-command-outcomes.patch
    ./patches/0005c-add-env-driven-sunshine-runtime-settings-request-hook.patch
    ./patches/0005d-add-spike-gated-sunshine-runtime-settings-adaptation.patch
    ./patches/0006-add-local-control-observability-ipc.patch
    ./patches/0007-wire-local-control-runtime-command-events.patch
    ./patches/0008-add-runtime-set-resolution-on-local-control.patch
    ./patches/0009-reopen-v4l2m2m-decoder-on-output-size-change.patch
    ./patches/0010-reopen-v4l2m2m-context-on-output-size-change.patch
    ./patches/0011-reset-sdl-presenter-on-output-size-change.patch
    ./patches/0012-add-runtime-touch-bounds-control.patch
    ./patches/0013-add-auto-window-resize-flag.patch
    ./patches/0014-disable-gamepad-quit-combo.patch
    ./patches/0015-crop-coded-alignment-padding-on-present.patch
  ];
in
stdenv.mkDerivation rec {
  pname = "moonlight-embedded-korri";
  version = "${upstreamMoonlightVersion}-korri";

  src = fetchFromGitHub {
    inherit (nixOnRocksMoonlightManifest.source)
      owner
      repo
      rev
      hash
      fetchSubmodules
      ;
  };

  patches = (map (patch: patch.file) basePatches) ++ korriPatches;

  nativeBuildInputs = [
    cmake
    perl
    pkg-config
  ];

  buildInputs = [
    alsa-lib
    avahi
    curl
    expat
    ffmpeg
    libcec
    libevdev
    libpulseaudio
    libpthreadstubs
    libva
    libvdpau
    libxcb
    libopus
    json_c
    SDL2
    systemdMinimal
    util-linux
    libdrm
    libglvnd
  ];

  strictDeps = true;

  cmakeFlags = nixOnRocksMoonlightManifest.cmakeFlags;

  postInstall = ''
    mkdir -p "$out/nix-support/moonlight-embedded-korri"

    {
      printf '%s\n' 'pname=${pname}'
      printf '%s\n' 'version=${version}'
      printf '%s\n' 'upstream-version=${upstreamMoonlightVersion}'
      printf '%s\n' 'nix-on-rocks-manifest-version=${nixOnRocksMoonlightManifest.version}'
      printf '%s\n' 'source-rev=${nixOnRocksMoonlightManifest.source.rev}'
      printf '%s\n' 'base-patches=${lib.concatMapStringsSep " " (patch: patch.name) basePatches}'
      printf '%s\n' 'korri-patches=${
        lib.concatMapStringsSep " " (patch: builtins.baseNameOf (toString patch)) korriPatches
      }'
      printf '%s\n' 'main-program=bin/moonlight'
    } > "$out/nix-support/moonlight-embedded-korri/manifest.txt"

    if [ -f "$out/bin/moonlight" ]; then
      printf 'present\n' > "$out/nix-support/moonlight-embedded-korri/moonlight-binary-present"
    else
      echo "error: moonlight binary missing from $out/bin" >&2
      exit 1
    fi

    if [ -f CMakeCache.txt ]; then
      cp CMakeCache.txt "$out/nix-support/moonlight-embedded-korri/CMakeCache.txt"
    fi
  '';

  meta = {
    description = "Korri downstream Moonlight Embedded build layered on nix-on-rocks with absolute touch and Sunshine runtime-settings patches";
    homepage = "https://github.com/moonlight-stream/moonlight-embedded";
    license = lib.licenses.gpl3Plus;
    mainProgram = "moonlight";
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
  };
}
