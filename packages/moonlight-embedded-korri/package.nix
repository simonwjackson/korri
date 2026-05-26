{ lib
, stdenv
, fetchFromGitHub
, cmake
, perl
, pkg-config
, alsa-lib
, avahi
, curl
, expat
, ffmpeg
, libcec
, libevdev
, libpulseaudio
, libpthreadstubs
, libva
, libvdpau
, libxcb
, libopus
, SDL2
, systemdMinimal
, util-linux
, libdrm
, libglvnd
, nix-on-rocks
}:

let
  nixOnRocksMoonlightManifest = import "${nix-on-rocks}/packages/moonlight-embedded/manifest.nix";

  # Keep the base SM8550/v4l2m2m Moonlight work in nix-on-rocks. Korri only
  # carries Korri-owned patches here.
  basePatchNames = [
    "0001-vendored-ffmpeg-drm-prime-pr932.patch"
    "0001a-fix-libdrm-cmake-find-and-main-help.patch"
    "0002-add-v4l2m2m-sdl-nv12-platform.patch"
    "0003-add-env-gated-v4l2m2m-pacing-experiments.patch"
  ];

  basePatches = builtins.filter (
    patch: builtins.elem patch.name basePatchNames
  ) nixOnRocksMoonlightManifest.patches;
in
stdenv.mkDerivation rec {
  pname = "moonlight-embedded-korri";
  version = "${nixOnRocksMoonlightManifest.version}-korri";

  src = fetchFromGitHub {
    inherit (nixOnRocksMoonlightManifest.source) owner repo rev hash fetchSubmodules;
  };

  patches = (map (patch: patch.file) basePatches) ++ [
    # Korri-owned patches layered on top of nix-on-rocks' base Moonlight package.
    ./patches/0004-add-absolutetouch-flag-for-tap-to-click.patch
    ./patches/0005-add-sunshine-runtime-settings-mvp.patch
  ];

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
      printf '%s\n' 'source-rev=${nixOnRocksMoonlightManifest.source.rev}'
      printf '%s\n' 'base-patches=${lib.concatMapStringsSep " " (patch: patch.name) basePatches}'
      printf '%s\n' 'korri-patches=0004-add-absolutetouch-flag-for-tap-to-click.patch 0005-add-sunshine-runtime-settings-mvp.patch'
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
    platforms = [ "aarch64-linux" "x86_64-linux" ];
  };
}
