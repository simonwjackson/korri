# SDL2 with the Batocera/Knulli "mali" video driver patch, targeting handhelds
# whose display path is PowerVR/Mali libEGL over fbdev rather than KMSDRM.
#
# Why this exists:
#
# As of nixpkgs 25.11, `pkgs.SDL2` is an alias for `sdl2-compat` (the
# SDL2-on-SDL3 shim, currently `sdl2-compat-2.32.60`). The shim ships only the
# `wayland / kmsdrm / opengles` video drivers — no fbdev-class backend. The
# previous `pkgs.SDL2_classic` attribute, which was a real SDL2 build that
# could be patched, has been removed:
#
#   "'SDL2_classic' has been removed. Consider upgrading to 'sdl2-compat',
#    also available as 'SDL2'."   — pkgs/top-level/aliases.nix
#
# The TRIMUI Brick (PowerVR GE8300 + Allwinner H700) has no KMS connectors —
# `pvrsrvkm` exposes `/dev/dri/card0` as a render-only node and the actual
# display surface is `dc_sunxi` → `/dev/fb0`. Stock Knulli ships a real SDL2
# `release-2.32.8` from libsdl-org/SDL with the Batocera `mali` patch
# (`sdl2_add_video_mali_gles2.patch`) applied, which adds an `SDL_VIDEO_MALI`
# code path that creates a window-equivalent surface against
# PowerVR/Mali libEGL using fbdev surface mode.
#
# `pkgs.moonlight-embedded` (and our `moonlight-embedded-korri`) takes an
# `SDL2` argument. With the upstream `sdl2-compat`, `SDL_CreateWindow` fails
# on the Brick (`SDL: could not create window - exiting`) even though every
# other layer of the closure binary runs cleanly (`-platform fake` streams
# end-to-end against aka Sunshine). Substituting this derivation for the
# `SDL2` argument restores the same garbled-but-flowing output the stock
# Knulli `/usr/bin/moonlight` produces on the same device.
#
# Lineage of the patch:
#
#   - Canonical upstream:
#       https://github.com/batocera-linux/batocera.linux/blob/master/board/batocera/patches/sdl2/sdl2_add_video_mali_gles2.patch
#   - Knulli inherits the same patch verbatim through its Batocera fork.
#   - The patch piggybacks on the SDL2 KMSDRM video driver code path but
#     uses fbdev surface mode at the EGL boundary (libEGL is told to use
#     `EGL_API_FB`), so no actual KMS device is required.
#
# Inputs:
#
#   - Real SDL2 source: `libsdl-org/SDL` tag `release-2.32.8` — matches the
#     exact commit Knulli's `/usr/lib/libSDL2-2.0.so.0` was built from
#     (`SDL-release-2.32.8-0-g98d1f3a45`, verified by reading the build-id
#     strings out of the on-device library).
#   - EGL/GLES headers from `libglvnd`. The actual libEGL/libGLES that
#     resolves `eglGetDisplay`/`eglGetPlatformDisplayEXT` at runtime is the
#     vendor PowerVR userspace on the device side — bundling those blobs is
#     covered by a follow-up Korri package; SDL2 only needs the headers and
#     `-lEGL -lGLESv2` link-time stubs at build time, plus `dlopen` resolution
#     at runtime.
#
# Substitution seam:
#
#   This derivation is wired into the Korri overlay in
#   `nix/overlays/korri-packages.nix`. The overlay points
#   `moonlight-embedded`'s `SDL2` argument at this build so that
#   `moonlight-embedded-korri` (and any other consumer of the Korri overlay)
#   gets a real SDL2 with `SDL_VIDEO_DRIVER_MALI` defined.
#
# Out of scope:
#
#   - Hardware-accelerated decode via `cedrus` v4l2m2m. The mali surface
#     here is a software-blit display target; HW decode is Path C.
#   - Pixel-format/stride garble. The Knulli stock `moonlight` also exhibits
#     it; fixing it is downstream of SDL2 and not in this derivation's scope.
#   - Real KMS modesetting. The Brick kernel does not expose KMS connectors;
#     until TrimUI opens that work, fbdev via Mali is the only surface.
{
  lib,
  stdenv,
  fetchFromGitHub,
  pkg-config,
  alsa-lib,
  libpulseaudio,
  libdrm,
  libevdev,
  libglvnd,
  libxkbcommon,
  systemdMinimal,
  dbus,
}:

stdenv.mkDerivation rec {
  pname = "SDL2-mali-fbdev";
  version = "2.32.8-mali";

  src = fetchFromGitHub {
    owner = "libsdl-org";
    repo = "SDL";
    rev = "release-${lib.removeSuffix "-mali" version}";
    hash = "sha256-GKJxA6P1bMCn8hW6kSIkGLOslnKmrr/0MbFA9UQk6LA=";
  };

  patches = [
    # Adds the `SDL_VIDEO_DRIVER_MALI` define and the EGL/GLES code paths
    # that target PowerVR/Mali libEGL over fbdev. Verbatim copy of
    # Batocera's `sdl2_add_video_mali_gles2.patch`.
    ./patches/sdl2_add_video_mali_gles2.patch
  ];

  nativeBuildInputs = [
    pkg-config
  ];

  # SDL2 has many optional video / audio backends. We keep only what is
  # actually useful on a fbdev/Mali handheld:
  #
  #   - alsa + pulse: audio that the moonlight binary actually uses.
  #   - libdrm: the mali path piggybacks on the KMSDRM code path even when
  #     no KMS device is present, so the headers must be available.
  #   - libevdev + systemdMinimal (libudev): input device discovery.
  #   - libglvnd: EGL/GLES headers and link-time stubs. The real libEGL is
  #     resolved at runtime against the vendor PowerVR userspace on the
  #     device.
  #
  # Deliberately omitted: wayland, x11, vivante, directfb, rpi, vulkan,
  # libsamplerate. The Brick has none of those surfaces and pulling them
  # in would only widen the closure.
  buildInputs = [
    alsa-lib
    libpulseaudio
    libdrm
    libevdev
    libglvnd
    libxkbcommon
    systemdMinimal
    dbus
  ];

  # Autotools build, not CMake. The Batocera patch modifies the generated
  # `configure` script directly (alongside `configure.ac`), so re-running
  # `autoreconf` would strip the configure-level mali hunks. Run configure
  # as-shipped after patches apply.
  preConfigure = ''
    # The mali patch flips `enable_video_mali` default to `yes` in
    # `configure.ac`, but the patched `configure` already carries that
    # logic. Pass the flag explicitly so the build is self-documenting.
    :
  '';

  configureFlags = [
    # Mali fbdev path is the whole reason this derivation exists.
    "--enable-video-mali"

    # Keep the kmsdrm code path compiled — the mali code reuses it for
    # EGL bring-up — but we don't actually need a KMS device at runtime.
    "--enable-video-kmsdrm"

    # Surfaces and backends we want.
    "--enable-video-opengles"
    "--enable-video-opengles2"
    "--enable-alsa"
    "--enable-pulseaudio"
    "--enable-libudev"
    "--enable-input-events"

    # Surfaces and backends we do NOT want on a fbdev/Mali handheld.
    # Knulli's stock SDL2 ships these disabled and we mirror that.
    "--disable-video-wayland"
    "--disable-video-x11"
    "--disable-video-vivante"
    "--disable-video-directfb"
    "--disable-video-rpi"
    "--disable-video-vulkan"
    "--disable-video-opengl"
    "--disable-jack"
    "--disable-esd"
    "--disable-arts"
    "--disable-nas"
    "--disable-sndio"

    # Dynamic-load the EGL/GLES at runtime against the vendor PowerVR
    # userspace blobs; the build-time link is against libglvnd stubs.
    "--enable-sdl-dlopen"
  ];

  # The mali patch hard-defines `EGL_API_FB` in the SDL_egl.c code path so
  # PowerVR libEGL enters fbdev surface mode. Also export the define
  # globally for any compilation unit that pulls EGL/EGL.h, mirroring the
  # Batocera/Knulli buildroot recipe.
  env.NIX_CFLAGS_COMPILE = "-DEGL_API_FB -DLINUX";

  strictDeps = true;

  enableParallelBuilding = true;

  postInstall = ''
    # Provenance manifest — mirrors the moonlight-embedded-korri pattern so
    # the source pin and mali patch are discoverable from the store path.
    mkdir -p "$out/nix-support/SDL2-mali-fbdev"
    {
      printf '%s\n' 'pname=${pname}'
      printf '%s\n' 'version=${version}'
      printf '%s\n' 'upstream-tag=release-2.32.8'
      printf '%s\n' 'upstream-rev=98d1f3a45 (matches Knulli /usr/lib/libSDL2-2.0.so.0)'
      printf '%s\n' 'mali-patch=sdl2_add_video_mali_gles2.patch (Batocera/Knulli verbatim)'
    } > "$out/nix-support/SDL2-mali-fbdev/manifest.txt"

    if [ -f "$out/lib/libSDL2-2.0.so.0" ] || [ -L "$out/lib/libSDL2-2.0.so.0" ]; then
      printf 'present\n' > "$out/nix-support/SDL2-mali-fbdev/libSDL2-present"
    else
      echo "error: libSDL2-2.0.so.0 missing from $out/lib" >&2
      ls -la "$out/lib" >&2 || true
      exit 1
    fi
  '';

  meta = {
    description = "SDL2 ${version} with the Batocera mali fbdev video driver patch, for PowerVR/Mali handhelds with no KMS connector";
    homepage = "https://github.com/libsdl-org/SDL";
    license = lib.licenses.zlib;
    platforms = [
      "aarch64-linux"
      "x86_64-linux"
    ];
    # No mainProgram: SDL2 is a library.
  };
}
