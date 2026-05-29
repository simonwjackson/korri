# SDL2 with the Batocera/Knulli "mali" video driver patch, built as a
# Korri-downstream broad-driver SDL2 for Moonlight.
#
# Why this exists:
#
# As of nixpkgs 25.11, `pkgs.SDL2` is an alias for `sdl2-compat` (the
# SDL2-on-SDL3 shim, currently `sdl2-compat-2.32.60`). The shim ships only a
# subset of the classic SDL2 video-driver behavior and pulls a large
# gstreamer/libdecor/GTK chain into `moonlight-embedded`'s runtime closure.
# More importantly for the TRIMUI Brick, it has no Batocera/Knulli `mali`
# fbdev-class backend.
#
# The Brick (PowerVR GE8300 + Allwinner H700) has no KMS connectors —
# `pvrsrvkm` exposes `/dev/dri/card0` as a render-only node and the actual
# display surface is `dc_sunxi` → `/dev/fb0`. Stock Knulli ships a real SDL2
# `release-2.32.8` from libsdl-org/SDL with the Batocera `mali` patch
# (`sdl2_add_video_mali_gles2.patch`) applied, which adds an
# `SDL_VIDEO_DRIVER_MALI` path that creates a window-equivalent surface
# against PowerVR/Mali libEGL using fbdev surface mode.
#
# Korri deliberately builds this as a broad SDL2, not as a Brick-only
# mali/kmsdrm library: wayland, x11, kmsdrm, vulkan, mali, and GLES drivers are
# all compiled into one binary. The non-mali hosts keep choosing their normal
# SDL driver at runtime, while fbdev-only handhelds can select `mali` via
# `SDL_VIDEODRIVER=mali`. Unused drivers are configured for runtime dlopen
# where SDL supports it, so the library remains portable across the fleet.
#
# Lineage of the patch:
#
#   - Canonical upstream:
#       https://github.com/batocera-linux/batocera.linux/blob/master/board/batocera/patches/sdl2/sdl2_add_video_mali_gles2.patch
#   - Knulli inherits the same patch verbatim through its Batocera fork.
#   - The patch piggybacks on SDL2's KMSDRM/GLES code path but uses fbdev
#     surface mode at the EGL boundary, so no actual KMS connector is required.
#
# Build notes:
#
#   - Real SDL2 source: `libsdl-org/SDL` tag `release-2.32.8`, matching the
#     `SDL-release-2.32.8-0-g98d1f3a45` strings found in Knulli's on-device
#     `/usr/lib/libSDL2-2.0.so.0`.
#   - The Batocera patch edits the generated `configure` script as well as
#     `configure.ac`; use the shipped autotools output and do not run
#     `autoreconf`.
#   - `-DEGL_API_FB` is intentionally not exported globally. With libglvnd
#     headers it is cosmetic; the runtime PowerVR libEGL behavior lives in the
#     vendor blobs resolved on the device side.
#
# Substitution seam:
#
#   `nix/overlays/korri-packages.nix` passes this derivation only as the
#   `SDL2` argument to `moonlight-embedded`. The global `pkgs.SDL2` alias stays
#   upstream `sdl2-compat` until a separate, wider substitution decision is
#   made.
{
  lib,
  stdenv,
  fetchFromGitHub,
  pkg-config,
  wayland-scanner,
  alsa-lib,
  dbus,
  libdrm,
  libevdev,
  libgbm,
  libglvnd,
  libpulseaudio,
  libxkbcommon,
  systemdMinimal,
  vulkan-loader,
  wayland,
  wayland-protocols,
  xorg,
}:

stdenv.mkDerivation rec {
  pname = "SDL2-korri";
  version = "2.32.8-korri";

  src = fetchFromGitHub {
    owner = "libsdl-org";
    repo = "SDL";
    rev = "release-${lib.removeSuffix "-korri" version}";
    hash = "sha256-GKJxA6P1bMCn8hW6kSIkGLOslnKmrr/0MbFA9UQk6LA=";
  };

  patches = [
    # Adds `SDL_VIDEO_DRIVER_MALI` and the EGL/GLES code paths that target
    # PowerVR/Mali libEGL over fbdev. Verbatim copy of Batocera's patch.
    ./patches/sdl2_add_video_mali_gles2.patch
  ];

  nativeBuildInputs = [
    pkg-config
    wayland-scanner
  ];

  buildInputs = [
    alsa-lib
    dbus
    libdrm
    libevdev
    libgbm
    libglvnd
    libpulseaudio
    libxkbcommon
    systemdMinimal
    vulkan-loader
    wayland
    wayland-protocols
    # SDL2 2.32's configure checks `wayland-scanner.pc` through the target
    # pkg-config path even though the scanner binary is a native build tool.
    wayland-scanner
    xorg.libX11
    xorg.libXScrnSaver
    xorg.libXcursor
    xorg.libXext
    xorg.libXi
    xorg.libxcb
    xorg.libXrandr
    xorg.libXxf86vm
    xorg.xorgproto
  ];

  configureFlags = [
    # Standard surfaces moonlight may use on x86 / SM8550 hosts.
    "--enable-video-wayland"
    "--enable-video-x11"
    "--enable-video-kmsdrm"
    "--enable-video-vulkan"

    # Batocera/Knulli fbdev-class surface for the Brick.
    "--enable-video-mali"

    # GLES paths required by kmsdrm/mali and by handheld GL stacks.
    "--enable-video-opengles"
    "--enable-video-opengles2"

    # Runtime-load driver dependencies when SDL supports it so one binary can
    # move across the fleet without every optional display stack present.
    "--enable-wayland-shared"
    "--enable-x11-shared"
    "--enable-kmsdrm-shared"

    # Runtime features moonlight actually uses.
    "--enable-alsa"
    "--enable-pulseaudio"
    "--enable-libudev"

    # Keep the broad display surface intentional without widening into legacy
    # or platform-specific drivers outside this plan.
    "--disable-video-vivante"
    "--disable-video-directfb"
    "--disable-video-rpi"
    "--disable-video-opengl"
    "--disable-jack"
    "--disable-esd"
    "--disable-arts"
    "--disable-nas"
    "--disable-sndio"
  ];

  env.NIX_CFLAGS_COMPILE = "-DLINUX";

  strictDeps = true;

  enableParallelBuilding = true;

  postInstall = ''
    mkdir -p "$out/nix-support/SDL2-korri"
    {
      printf '%s\n' 'pname=${pname}'
      printf '%s\n' 'version=${version}'
      printf '%s\n' 'upstream-tag=release-2.32.8'
      printf '%s\n' 'upstream-rev=98d1f3a45 (matches Knulli /usr/lib/libSDL2-2.0.so.0)'
      printf '%s\n' 'mali-patch=sdl2_add_video_mali_gles2.patch (Batocera/Knulli verbatim)'
      printf '%s\n' 'drivers=wayland x11 kmsdrm vulkan mali opengl_es1 opengl_es2 dummy offscreen'
    } > "$out/nix-support/SDL2-korri/manifest.txt"

    if [ -f "$out/lib/libSDL2-2.0.so.0" ] || [ -L "$out/lib/libSDL2-2.0.so.0" ]; then
      printf 'present\n' > "$out/nix-support/SDL2-korri/libSDL2-present"
    else
      echo "error: libSDL2-2.0.so.0 missing from $out/lib" >&2
      ls -la "$out/lib" >&2 || true
      exit 1
    fi

    config="$out/include/SDL2/SDL_config.h"
    for define in SDL_VIDEO_DRIVER_MALI SDL_VIDEO_DRIVER_KMSDRM SDL_VIDEO_DRIVER_WAYLAND SDL_VIDEO_DRIVER_X11; do
      if ! grep -E "^#define $define 1$" "$config" >/dev/null; then
        echo "error: expected $define in $config" >&2
        exit 1
      fi
    done
  '';

  meta = {
    description = "Korri SDL2 ${version} with Batocera mali fbdev video driver plus standard desktop/DRM drivers";
    homepage = "https://github.com/libsdl-org/SDL";
    license = lib.licenses.zlib;
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
    # No mainProgram: SDL2 is a library.
  };
}
