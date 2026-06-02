---
title: Vendor SDL2 + mali-fbdev patch for moonlight-embedded-korri on fbdev-only handhelds
date: 2026-05-28
category: docs/solutions/tooling-decisions
module: moonlight-embedded-korri
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Building moonlight-embedded-korri (or any SDL2-consuming Korri package) for a handheld where `ls /sys/class/drm/` shows no `card*-*` connector nodes
  - Targeting PowerVR-class GPUs without a mainline KMS driver (GE8300 on Allwinner A133P, SGX on older Allwinner/RK)
  - Host distro is Batocera-family (Batocera, Knulli, JELOS) and already ships a mali-patched libSDL2 plus vendor EGL/GLES blobs in /usr/lib
  - "`-platform sdl` fails at `SDL: could not create window` while `-platform fake` reaches `Received first video packet`"
  - "`-platform ffmpeg_drm` reports `no connected display` \u2014 the KMS path telling you the device is fbdev-only"
tags:
  - moonlight-embedded
  - sdl2
  - sdl2-compat
  - nixpkgs
  - powervr
  - fbdev
  - mali
  - trimui-brick
related_components:
  - moonlight-embedded-korri
  - korri-stream
  - SDL2
  - libEGL
  - sunshine
related_docs:
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md
  - docs/solutions/best-practices/wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md
  - docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md
---

# Vendor SDL2 + mali-fbdev patch for moonlight-embedded-korri on fbdev-only handhelds

## Context

We ship a custom downstream of moonlight-embedded as `packages/moonlight-embedded-korri/` so that our patches to `libmoonlight-common.so.4` (absolute touch, Sunshine runtime-settings IPC, local control observability) ride with the binary. That binary needs to drive a display somewhere — and on the TRIMUI Brick (Allwinner A133P + PowerVR GE8300, the first device in the "fbdev-only PowerVR" cohort we plan to support) it cannot.

The closure pairs against Sunshine, negotiates codecs, even reaches `Received first video packet after 0 ms` under `-platform fake`. It dies at `SDL: could not create window` because `pkgs.SDL2` in current nixpkgs is an alias for **`sdl2-compat-2.32.60`** — an SDL2-ABI shim that re-implements the API on top of SDL3. The shim's video drivers are `wayland`, `kmsdrm`, and `opengles`. The Brick has none of those: no Wayland compositor, no KMS connectors (`/sys/class/drm/` has only `card0` and `renderD128`, no `card0-*` connector subdirs), and the shim's opengles backend does not bind to PowerVR's fbdev EGL.

Knulli's stock `/usr/bin/moonlight` paints to `/dev/fb0` because Knulli's Buildroot builds SDL2 from source with **Batocera's `sdl2_add_video_mali_gles2.patch`** applied — adding a `MALI_bootstrap` video driver that hands an `fbdev_window` to `eglCreateWindowSurface`, which PowerVR's vendor libEGL accepts when compiled with `-DEGL_API_FB`. Our closure cannot reach that path because nixpkgs no longer exposes a real SDL2 we can build the same way.

## Guidance

Vendor SDL2 ourselves and use it as `moonlight-embedded-korri`'s SDL2 input instead of `pkgs.SDL2`. Runtime libEGL / libGLESv2 continue to come from the host distro's `/usr/lib` via dlopen — we don't nix-vendor the PowerVR blobs themselves (that's Path C territory, a separate plan).

Concrete recipe:

- **New derivation** at `packages/SDL2-mali-fbdev/`:
  - Source: `libsdl-org/SDL` at `release-2.32.x` (match Knulli's pin where reasonable; verify minor by stringing `/usr/lib/libSDL2-2.0.so.0` on the device).
  - Apply [`sdl2_add_video_mali_gles2.patch`](https://github.com/batocera-linux/batocera.linux/blob/master/board/batocera/patches/sdl2/sdl2_add_video_mali_gles2.patch) (~115 lines, adds the `mali` video driver path through SDL2's kmsdrm machinery + extends `SDL_egl.c` to use `eglGetPlatformDisplay` when `SDL_VIDEO_DRIVER_MALI` is defined).
  - CMake/configure flags:
    - `-DSDL_VIDEO_MALI=ON`
    - `EXTRA_CFLAGS="-DLINUX -DEGL_API_FB"` (this is what tells PowerVR's libEGL to use fbdev surface mode)
    - Disable: `-DSDL_WAYLAND=OFF -DSDL_X11=OFF -DSDL_VIVANTE=OFF -DSDL_DIRECTFB=OFF -DSDL_RPI=OFF -DSDL_KMSDRM=OFF`
  - Build inputs: `libglvnd` for EGL/GLES headers only. **Do not vendor** the PowerVR blobs — runtime libEGL/libGLESv2 must come from the device's `/usr/lib` via dlopen so we don't pin the wrong vendor userspace into the closure.

- **Override the `SDL2` argument** in `packages/moonlight-embedded-korri/package.nix`. Approximate shape (real wiring depends on how `flake.nix` / `nix/overlays/korri-packages.nix` instantiate the package):

  ```nix
  let
    sdl2-mali-fbdev = pkgs.callPackage ../SDL2-mali-fbdev { };
  in
  pkgs.callPackage ./package.nix {
    # Replace nixpkgs.SDL2 (currently aliased to sdl2-compat-2.32.60)
    # with a real SDL2 + Batocera mali patch. moonlight-embedded picks
    # this up as its SDL2 build/link input; runtime libEGL/libGLESv2
    # still come from the device's /usr/lib via dlopen at
    # SDL_CreateWindow time.
    SDL2 = sdl2-mali-fbdev;
  }
  ```

- **Runtime contract on the device**: `LD_LIBRARY_PATH` (or the loader's default search path) must reach the host's `/usr/lib` so SDL2's mali driver can dlopen the PowerVR blobs. `SDL_VIDEODRIVER=mali` is optional once mali is the only video driver compiled in, but setting it explicitly removes ambiguity.

After the rebuild + reship, the closure binary should reach the same "garbled-but-flowing" frame output that Knulli's stock `/usr/bin/moonlight` produces today. The garble is a separate downstream concern (pixel format / stride mismatch between SDL2's mali driver and the panel's expected format) and is **not** in scope for this decision.

## Why This Matters

- **`pkgs.SDL2` is not SDL2 anymore.** Anyone reading `packages/moonlight-embedded-korri/package.nix` sees `SDL2` in `buildInputs` and reasonably assumes it's the SDL2 library shipped to the closure. It isn't — in current nixpkgs it's `sdl2-compat-2.32.60`, an SDL2-ABI shim that re-implements the API on top of SDL3. The shim's video driver list is `wayland`, `kmsdrm`, `opengles`. No `fbdev`. No `mali`. No `dispmanx`. On a device with no Wayland compositor and no DRM connectors, every one of those drivers fails at `SDL_CreateWindow`. The binary looks healthy through pairing and codec negotiation, then dies at the display seam, which makes the failure easy to misattribute to networking, codecs, or Sunshine.

- **Fbdev-only handhelds are architecturally different from KMS handhelds.** The R36T MAX (Mali-G31, RK3326) has a real KMS path: `/sys/class/drm/` shows `card0-HDMI-A-1` and friends, `-platform ffmpeg_drm` works, and SDL2's kmsdrm driver works with the device's GBM. The Brick splits responsibilities differently: `pvrsrvkm` is a render-only DRM node with no connectors, and the actual scanout lives in the Allwinner display controller (`dc_sunxi`) exposed only as `/dev/fb0`. Any binary built assuming "GPU implies KMS" cannot drive the panel on these devices. Until the Brick gets a mainline KMS driver (deferred — TrimUI has not published kernel sources), fbdev + mali EGL is the only path that exists.

- **Mali + `EGL_API_FB` is the only generic option that works.** Batocera, Recalbox, EmuELEC, and Knulli have all converged on the mali SDL2 video driver precisely because it's the one path that works across PowerVR (GE8300, SGX), Mali (G31, G52), and other vendor blobs that ship an fbdev EGL. SDL hands an `fbdev_window` to `eglCreateWindowSurface`; the vendor blob owns the rest. We don't need to know which GPU is on the other end — we just need SDL to stop assuming a window system exists.

- **This is the cost of shipping our own closure.** Our patches to `libmoonlight-common.so.4` are not optional — they're how Korri talks to Sunshine for runtime-settings adaptation and local-control IPC. We cannot fall back to "just use `/usr/bin/moonlight`" on these devices without losing those patches (and confirmed today by a sharp error: hybrid LD_LIBRARY_PATH=/usr/lib + our binary fails with `undefined symbol: LiSendSunshineRuntimeSettingsMvp` because the host's `libmoonlight-common.so.4` doesn't carry it). The cost of owning the binary is that we own the SDL2 build decision too. Nixpkgs' default is wrong for this device class, and we vendor around it until either (a) nixpkgs grows a real SDL2 with the mali video driver as a separate attribute, or (b) we move to Path C (vendoring the PowerVR userspace and writing our own fbdev display backend, decoupling from SDL2 entirely).

## When to Apply

- Any time we're building a Korri closure for a handheld where `/sys/class/drm/` shows no `card*-*` connector subdirectories — that's the canonical fbdev-only signal.
- Targeting PowerVR-class GPUs without an upstream KMS driver (GE8300 on Allwinner A133P, SGX series on older Allwinner / RK), where userspace is a vendor blob in `/usr/lib`.
- Host distro is Batocera-family (Batocera, Knulli, JELOS variants) and already ships a mali-patched `libSDL2-2.0.so.0` plus the vendor EGL/GLES blobs in `/usr/lib`.
- Any time `-platform sdl` fails at `SDL: could not create window` while `-platform fake` reaches `Received first video packet` — that diagnostic split is the signal.
- Any time `-platform ffmpeg_drm` reports `no connected display` — that's the KMS path telling you the device is fbdev-only.
- Any future SDL2-consuming Korri package (emulator frontends, kiosk shells) targeting the same device cohort — apply the same `SDL2` override at the package boundary rather than per-call.

## Examples

### Diagnostic walkthrough — does this handheld need the pattern?

Three SSH probes establish the constraint before you touch a build:

```sh
# 1. Are there any DRM connectors? Empty/render-only -> no KMS path.
ls /sys/class/drm/
#   card0  renderD128            <-  render-only; no card0-HDMI-A-1 etc.

# 2. What is fb0 actually backed by? An Allwinner / vendor display
#    controller name here means the panel is driven through fbdev.
cat /sys/class/graphics/fb0/name
#   disp                         <-  dc_sunxi / Allwinner display

# 3. Which video drivers did the host's SDL2 actually compile in?
#    Every SDL video driver registers a *_bootstrap symbol, so grepping
#    for them enumerates the backends. busybox lacks `strings`, so use
#    the tr-into-newlines trick:
tr -c '\11\12\15\40-\176' '\n' < /usr/lib/libSDL2-2.0.so.0 \
  | grep _bootstrap$
#   MALI_bootstrap               <-  this is the only one that will work
#   DUMMY_bootstrap
```

If you see no connectors, an `fb0` named after a vendor display controller, and `MALI_bootstrap` in the host's SDL2 — you're on a device that needs this pattern.

### Validation pattern — isolate the display backend with `-platform fake`

`-platform fake` runs the entire moonlight pipeline (pairing, server-info, codec negotiation, network receive, decode dispatch) and stops at the display backend. It's the cheapest architectural smoke test we have:

```sh
moonlight stream Desktop -platform fake -verbose 192.168.1.117
#   ...
#   Received first video packet after 0 ms
#   ...
#   (clean shutdown sequence)
```

If `-platform fake` succeeds and `-platform sdl` fails at `SDL: could not create window`, every layer below the display backend is working. The bug is in the SDL build — not the network, not the codec, not the pair cert. That diagnostic split is what points at the SDL2-mali-fbdev fix rather than at moonlight or Sunshine.

### Mali-shim trick — validate before you rebuild

Before paying for a full SDL2 rebuild + reship, you can prove the diagnosis cheaply by letting the closure binary use the host's mali-patched SDL2 *only* for SDL, while keeping our patched `libmoonlight-common.so.4` from the closure. The trick is a minimal symlink directory that shadows exactly the libs you want and nothing else:

<details>
<summary>mali-shim setup</summary>

```sh
# On the device:
mkdir -p /tmp/mali-shim
cd /tmp/mali-shim

# Pull in the host's SDL2 + PowerVR userspace only.
ln -s /usr/lib/libSDL2-2.0.so.0 .
ln -s /usr/lib/libEGL.so.1 .
ln -s /usr/lib/libGLESv2.so.2 .
ln -s /usr/lib/libIMGegl.so .
ln -s /usr/lib/libsrv_um.so .
ln -s /usr/lib/libglslcompiler.so .
ln -s /usr/lib/libusc.so .
ln -s /usr/lib/libufwriter.so .

# Run the closure binary with the shim first, so the host's SDL2
# shadows our closure's sdl2-compat, but libmoonlight-common.so.4
# and everything else still resolve from the closure.
LD_LIBRARY_PATH=/tmp/mali-shim:/lib \
SDL_VIDEODRIVER=mali \
  /path/to/closure/bin/moonlight stream Desktop -platform sdl -verbose 192.168.1.117
```

</details>

Naive variant — `LD_LIBRARY_PATH=/usr/lib:/lib` — also "works" but shadows `libmoonlight-common.so.4`, `libssl`, `libavcodec`, and ~20 other libraries with their host versions, which crashes the binary with `undefined symbol: LiSendSunshineRuntimeSettingsMvp` because the host's `libmoonlight-common` lacks our Korri patches. The shim dir is the way.

If you reach the same `SDL: could not create window` even with the host's mali-patched SDL2 in front of the loader, the bug is something else. If the failure mode changes (typically: it gets further, or starts producing the same garbled-but-flowing picture the stock binary produces), you've confirmed the SDL2 build is the right thing to fix and the nix rebuild is worth doing. Today's experiment on the Brick: same `SDL_CreateWindow` failure with the shim — confirming the issue is the binary's compile-time SDL2 ABI (sdl2-compat) diverging from the runtime SDL2 (real, mali-patched), not a missing dlopen target.

### Operational note — disarm ES respawn during display experiments

Knulli's `emulationstation-standalone` respawns ES on crash, and a dirty `fb0` left behind by a failed moonlight run makes ES crash on startup — which looks indistinguishable from a kernel boot loop. Before iterating on display backends:

```sh
knulli-settings-set system.es.atstartup 0
# persistent across reboot; experiment freely, set back to 1 when done
```

This is the single most useful environmental change for staying sane while debugging the SDL/fb0 seam on Knulli.

## Related

- [moonlight-embedded-korri bringup on aarch64 handheld](../best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md) — origin recipe for the closure-shipping pattern. The "pin yourself to `-platform sdl` for first light" advice in §2 is correct on R36T MAX (Mali-G31 + KMS) but silently wrong on fbdev-only PowerVR targets like the Brick. That doc should be amended with a caveat pointing here.
- [Staged layer adoption for constrained handheld bringup](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md) — strategic Brick bringup map. Track 2's "Moonlight: as today" line elides the SDL2 build question this doc answers. Add a footnote there pointing here.
- [Wayland userspace on Mali-G31 handheld via newer libmali](../best-practices/wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md) — same discipline (runtime GPU libs come from host via dlopen, don't pull them from the Nix closure), different hardware (Mali-G31 GBM + Wayland vs PowerVR GE8300 fbdev).
- [Chunked nix closure transfer over flaky WiFi](../best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md) — the ship recipe that delivers whichever SDL2 the closure ends up depending on.
