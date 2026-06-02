---
title: Modern Wayland userspace on RK3326 / Mali-G31 handheld via newer libmali and bwrap on read-only root
date: 2026-05-27
category: docs/solutions/best-practices
module: device-runtime
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Bringing up KORRI userspace on an EmuELEC / ROCKNIX-class handheld with RK3326 + Mali-G31 (e.g. R36T MAX)
  - Vendor stock OS ships a read-only / and an ancient (r13p0-era) libmali blob that lacks modern GBM symbols
  - Have a writable /storage partition and SSH root, but no logind / no functioning wayland-server libs on the device
  - Need a Nix-built modern Wayland compositor (wlroots / cage) running on the vendor GPU stack without flashing the device
tags:
  - rocknix
  - emuelec
  - rk3326
  - mali-g31
  - libmali
  - wayland
  - cage
  - nix-portable
  - bwrap
related_components:
  - korri-server
  - nix-portable
---

# Modern Wayland userspace on RK3326 / Mali-G31 handheld via newer libmali and bwrap on read-only root

## Context

KORRI targets constrained handhelds (TRIMUI Brick, R36T MAX, Anbernic family). The
stock OS on R36T MAX is **EmuELEC 4.7-Nexus**: a read-only root, no
logind, busybox userland, EmulationStation on framebuffer/SDL2, **2017-era
libmali blob** (`r13p0-01rel0`). KORRI needs Wayland (Gamescope / wlroots-class
compositor + Moonlight) on this same userspace — without flashing the device,
without giving up the stock recovery path.

This learning is the concrete proof-of-path on R36T MAX: **a Nix-built
wlroots compositor (cage) driving the DSI panel through the vendor GPU stack,
hosting a visible Wayland client, with all device state recoverable by a
reboot.** It only became possible after three pieces clicked together:

1. **Newer libmali blob** that exports the GBM API wlroots actually uses (2024-era ARM `g24p0` release).
2. **bwrap-based namespace** that fakes a writable `/` and binds Nix paths
   in, because the device's `/` is genuinely read-only.
3. **Verification at the right level** — first a direct-KMS C program
   (no compositor), then cage on libmali, then a custom **wl_shm** client
   that bypasses Mali's client-side EGL entirely. The wl_shm client is what
   put visible color on the panel.

The arc matters because each layer is independently useful for other
RK3326-class devices (Anbernic, RG-series, the various R3X handhelds).
Anyone trying to bring up modern Wayland userspace on stock vendor firmware
will hit the same wall.

## Guidance

### 1. Probe the device first with a direct-KMS C program before touching compositors

Vendor Mali stacks have two failure modes that look identical from a compositor
log but require different fixes:

- the blob's GBM API surface is too old for wlroots, **or**
- the blob is fine but the compositor isn't initialising in the order Mali expects.

A ~250-line C program that opens `/dev/dri/card0`, dlopens the
device's `/usr/lib/libmali.so`, creates a GBM device, requests an EGL
display via `eglGetPlatformDisplayEXT(EGL_PLATFORM_GBM_KHR, gbm, NULL)`,
clears red, and scans out via `drmModeAddFB + drmModeSetCrtc` answers
the question. If the panel turns red, the kernel + KMS + vendor blob all
work. If not, the kernel side is the suspect, not your compositor.

Two non-obvious points the program must respect:

- **Open `/dev/dri/card0`, not `/dev/dri/renderD128`**, even though Mali
  ultimately uses the render node. libmali's GBM path issues
  `drm_setversion`, which needs DRM-master semantics. Wrong open order
  permanently wedges the Mali kernel module until reboot (D-state in
  `drm_dropmaster_ioctl`).
- **Use `eglGetPlatformDisplayEXT` via `eglGetProcAddress`**, not
  `eglGetDisplay(NULL)`. Mali's `eglGetDisplay(EGL_DEFAULT_DISPLAY)`
  returns 0. Mesa-targeted demos (`eglkms`, `kmscube` defaults) silently
  drop into a "no display" path on Mali.

This program is also the simplest possible proof that Nix-built C
aarch64 binaries run end-to-end on the device — useful as Stage B2/A in
the staged-layer-adoption framing (see Related).

### 2. Swap the vendor libmali for a newer ARM release; do not write a shim

The first instinct on missing GBM symbols is to LD_PRELOAD a tiny
`gbm-shim.so` that stubs out `gbm_bo_get_modifier`, `_get_plane_count`,
`_get_offset`, `_stride_for_plane`, `_create_with_modifiers`, etc.,
returning `LINEAR` modifiers, `plane_count=1`, `offset=0`. **Don't.** A
shim gets cage past EGL extension enumeration into wlroots-internal code
that then SIGSEGVs inside libmali — and every crash that holds DRM master
wedges the kernel and forces a reboot.

The right fix is to replace `/usr/lib/libmali.so` (or, since `/` is
read-only on these stock OSes, ship a copy to `/storage/lib/`) with a
2024-era blob:

```sh
URL="https://github.com/JeffyCN/mirrors/raw/libmali/lib/aarch64-linux-gnu/libmali-bifrost-g31-g24p0-wayland-gbm.so"
curl -sL -o /tmp/libmali-new.so "$URL"
# ship to /storage/lib/libmali-g24p0.so on device
```

Choose the variant by name suffix:

- `g31` — Mali-G31 (RK3326). Use `g52` for RK356x, `g610` for RK3588, etc.
- `g24p0` — release version. `g24p0 > g13p0 > g2p0`. Pick the newest.
- `-wayland-gbm` — supports both client (`wayland`) and server (`gbm`)
  modes. Use this for cage even though cage is a Wayland *server*: it
  lets eventual GLES2 clients connect.

The newer blob exports every modern GBM symbol the older one was missing:
`gbm_bo_get_modifier`, `gbm_bo_get_plane_count`, `gbm_bo_get_offset`,
`gbm_bo_get_stride_for_plane`, `gbm_bo_get_handle_for_plane`,
`gbm_bo_get_fd_for_plane`, `gbm_bo_create_with_modifiers[2]`,
`gbm_surface_create_with_modifiers[2]`, `gbm_bo_map`, `gbm_bo_unmap`,
`gbm_format_get_name`, `gbm_get_configs`.

### 3. Redirect the Nix closure's `libEGL`/`libGLESv2`/`libgbm` at the new blob

The compositor's Nix closure already has libglvnd and mesa-libgbm. The
swap is symlinks inside the closure store paths:

```sh
NEW=/storage/lib/libmali-g24p0.so
GLVND=/storage/nix/store/<hash>-libglvnd-1.7.0/lib
GBM=/storage/nix/store/<hash>-mesa-libgbm-25.1.0/lib

for f in \
  $GLVND/libEGL.so $GLVND/libEGL.so.1 $GLVND/libEGL.so.1.1.0 \
  $GLVND/libGLESv2.so $GLVND/libGLESv2.so.2 $GLVND/libGLESv2.so.2.1.0 \
  $GBM/libgbm.so $GBM/libgbm.so.1 $GBM/libgbm.so.1.0.0
do
  ln -sf "$NEW" "$f"
done
```

**Re-apply these symlinks any time you tar-extract a closure that
contains the same store paths** — tar overwrites the symlinks with the
real files from the tarball, silently undoing the redirect.

### 4. Run the compositor inside `bwrap`, not against the bare `/`

EmuELEC / ROCKNIX-class roots are read-only. Modern compositors and
cage's helpers want a writable `/`, scratch in `/tmp`, and a `/nix`
prefix that matches the closure's paths. `bwrap` from `nix-portable`
solves all three:

```sh
BWRAP=/storage/nix-portable-root/.nix-portable/bin/bwrap
$BWRAP \
  --tmpfs / \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /etc /etc \
  --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --dev-bind /dev /dev --proc /proc --bind /sys /sys \
  --bind /storage /storage --bind /storage/nix /nix \
  --bind /run /run --bind /tmp /tmp \
  --setenv LIBSEAT_BACKEND builtin \
  --setenv XDG_RUNTIME_DIR /tmp/wayland \
  --setenv WLR_BACKENDS drm \
  --setenv WLR_DRM_DEVICES /dev/dri/card0 \
  --setenv WLR_RENDERER gles2 \
  --setenv LD_LIBRARY_PATH "$GCC_LIB:$GLIBC_LIB" \
  $CAGE -- ...
```

Notes:

- `--tmpfs /` then `--ro-bind /usr /usr`, `/lib`, `/etc`, `/bin`, `/sbin`
  preserves the vendor userspace for things the compositor still calls
  out to (`xkbcommon` keymaps, `/etc/passwd`, ...).
- `--bind /storage/nix /nix` makes the closure's hardcoded `/nix/store`
  paths resolve correctly.
- `LIBSEAT_BACKEND=builtin` uses libseat's embedded seatd, so you don't
  need a logind session (EmuELEC has none). `direct` is not a valid
  backend name despite some docs implying otherwise.
- Create `/tmp/wayland` with mode `0700` **before** running cage, or the
  Wayland socket creation fails with `Unable to open Wayland socket:
  Invalid argument` (cage tries to create lockfiles for `wayland-0`
  through `wayland-32` and bails when all fail).
- `LD_LIBRARY_PATH` must include `gcc-lib` (for `libstdc++`/`libgcc_s`)
  and the closure's `glibc` (matching the closure's ld) — otherwise
  the compositor's binaries can't find their own libc.
- The compositor closure binds libmali at `dlopen`-time. Mali's blob
  has `NEEDED: libwayland-server.so.0` (it includes server-side
  buffer-binding code) **even when used by client apps**. If a client
  spawned by cage can't find `libwayland-server.so.0`, the dlopen of
  `libEGL.so.1` will silently fail with `destroying link map`. Include
  the wayland nix path in `LD_LIBRARY_PATH` for clients that load libmali.

### 5. Use `wl_shm` (CPU framebuffer) to prove visible output before fighting Mali client-mode EGL

Once cage runs, the natural next step is `glmark2-es2-wayland` or
similar. **Don't start there.** Mali's client-mode EGL needs the
compositor to expose `EGL_WL_bind_wayland_display` *and* to call
`eglBindWaylandDisplayWL` at the right point, *and* `eglInitialize` can
still fail with `0x3001 EGL_NOT_INITIALIZED` for reasons that aren't
worth debugging just to validate the compositor.

The fastest "did the screen actually change?" test is a ~200-line
`wl_shm` client that allocates an `ARGB8888` buffer via `memfd_create`,
fills it with a solid color, attaches it to an `xdg_toplevel`
fullscreen surface, commits, then repeats with a new color every
~700 ms. Pure protocol + CPU. No EGL, no Mali client mode, no Mesa.

```c
struct wl_buffer *make_buffer(uint32_t argb) {
    int stride = width * 4, fd = memfd_create("wlcolor-shm", MFD_CLOEXEC);
    ftruncate(fd, stride * height);
    uint32_t *px = mmap(NULL, stride*height, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
    for (size_t i = 0; i < (size_t)width*height; i++) px[i] = argb;
    munmap(px, stride*height);
    struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, stride*height);
    struct wl_buffer *buf = wl_shm_pool_create_buffer(pool, 0, width, height,
                                                     stride, WL_SHM_FORMAT_ARGB8888);
    wl_shm_pool_destroy(pool); close(fd); return buf;
}
```

This client is also the lowest-overhead **smoke test** for any new
KORRI userspace stack — if the panel does not visibly cycle colors when
you swap a layer (kernel, libmali, compositor, closure glibc), the
layer is broken.

### 6. Build aarch64 binaries on a Nix aarch64 builder, not on the device

Cross-compilation on x86 hosts works but is fragile for closures. A
dedicated aarch64 NixOS builder (4 cores is enough for the closures
involved) lets you use plain `nix shell` and `nix build`. The transfer
pattern that survives EmuELEC's missing `scp`/`sftp-server`:

```sh
# build on the aarch64 nix builder
ssh builder 'nix shell nixpkgs#gcc nixpkgs#libdrm.dev nixpkgs#pkg-config nixpkgs#patchelf \
  -c bash -c "gcc -std=gnu11 -o /tmp/redscreen /tmp/redscreen.c \
              \$(pkg-config --cflags --libs libdrm) -ldl -lEGL"'
# patchelf to use the device's libc (or the closure's, with full RPATH)
ssh builder 'nix shell nixpkgs#patchelf -c patchelf \
  --set-interpreter /lib/ld-linux-aarch64.so.1 \
  --set-rpath /usr/lib /tmp/redscreen'
# ship via a single SSH pipe — no scp on the device
ssh builder 'cat /tmp/redscreen' \
  | ssh -p 2222 root@device 'cat > /storage/bin/redscreen && chmod 755 /storage/bin/redscreen'
```

`-std=gnu11` matters: GCC 15's default C23 mode references
`__isoc23_strtol`, which lives in GLIBC_2.38 and breaks on the device's
glibc 2.36.

### 7. Always run experiments behind a 60-second EmulationStation safety-net timer

Mali kernel-state corruption is silent until the next userspace
process tries to talk to DRM. The recovery cost is a reboot, which on
EmuELEC drops you back at the stock UI. To keep the device usable
between failed experiments:

```sh
systemd-run --on-active=60s --unit=korri-es-recover \
  systemctl start emustation.service
systemctl stop emustation.service
# ...run experiment...
# on success:
systemctl stop korri-es-recover.timer
systemctl reset-failed korri-es-recover.timer korri-es-recover.service
```

If the experiment hangs, ES comes back automatically. If it succeeds,
cancel the timer.

## Why This Matters

- **Owning the runtime needs Wayland.** KORRI's launch-game posture is
  Gamescope / wlroots-class compositor + Moonlight. SDL2-on-framebuffer
  (the EmulationStation path) is a dead end for that posture.
- **Vendor blobs gate everything.** The kernel Mali driver is bound to
  the userspace blob; there is no Mesa Panfrost path for Mali-G31
  Bifrost yet that performs acceptably. The blob choice is the GPU
  choice. Picking the right release version is a one-line decision that
  unlocks (or blocks) every higher layer.
- **Read-only roots are normal on these handhelds.** ROCKNIX, EmuELEC,
  Batocera, ArkOS all ship `/` as squashfs or read-only ext4. `bwrap`
  is the only general-purpose answer for staged Nix userspace on top of
  these stocks — it's also what makes KORRI's "non-destructive recon"
  approach (`/se-compound` on `non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md`) compose with the runtime layer.
- **Visible-output validation isn't optional.** The compositor log can
  print "modeset, FBO, wayland-0 ready" and the panel can still be
  black if the buffer never reaches the connector. `wl_shm` cycling
  colors is the lowest-cost way to confirm the pixel actually arrived.

## When to Apply

- New RK3326 / RK35xx handheld whose stock OS ships an old libmali.
  Same recipe with the right blob suffix (g52 / g610 / g310).
- Validating B2 ("Mali / KMS / Wayland userspace works on this device")
  from the staged-layer-adoption framing before committing to a full
  NixOS image swap.
- Bringing up a wlroots-class compositor (cage, sway, wayfire, gamescope)
  on any device where `/` is read-only and logind is absent.
- Triaging "EGL extensions look fine but my client fails to init":
  apply guidance 5 (wl_shm) to bisect compositor vs Mali-client-mode.

## Examples

### Newer-libmali → cage modeset on DSI panel

After swapping in `libmali-bifrost-g31-g24p0-wayland-gbm.so` and
redirecting the closure's libEGL/libGLESv2/libgbm at it, cage on R36T
MAX produces:

```text
[INFO] EGL vendor: ARM, EGL 1.5
[INFO] Supported EGL display extensions: EGL_WL_bind_wayland_display
       EGL_KHR_platform_gbm EGL_KHR_platform_wayland
       EGL_EXT_image_dma_buf_import_modifiers ...
[INFO] GL renderer: Mali-G31
[INFO] Using OpenGL ES 3.2 v1.g24p0-00eac0
[DEBUG] Allocated 680x680 GBM buffer XR24 (LINEAR)
[INFO] connector DSI-1: Modesetting with 680x680 @ 60.597 Hz
[DEBUG] Cage 0.2.1 is running on Wayland display wayland-0
```

The pre-swap log on the same closure said `gbm_bo_get_offset: undefined
symbol` and SIGSEGV inside libmali during ADDFB2-modifiers setup.

### `wl_shm` color cycler proves visible output

The 200-line `wlcolor.c` driving cage produces:

```text
configured; cycling colors at 680x680 for 25s
frame 0 color=#ffff0000   ← red
frame 1 color=#ff00ff00   ← green
frame 2 color=#ff0000ff   ← blue
frame 3 color=#ffffff00   ← yellow
frame 4 color=#ffff00ff   ← magenta
frame 5 color=#ff00ffff   ← cyan
frame 6 color=#ffffffff   ← white
... (35 frames over 25s)
exiting after 35 frames
```

with the panel actually cycling those colors. wlroots logs
`Failed to import buffer for scan-out` (the wl_shm buffer can't be
direct-scanned-out) and falls back to compositing via GLES2 — exactly
what is expected on this hardware.

### Counter-example: glmark2-es2-wayland still fails

After everything above works, `glmark2-es2-wayland` still hits
`eglInitialize() failed with error: 0x3001` inside cage. Cage's log
shows glmark2 *did* connect, *did* create a `wlr_surface`, and *did*
dlopen libmali — Mali's client-mode EGL initialisation is its own
rabbit hole and unrelated to the compositor stack working. This is the
intended scope of guidance 5: validate the compositor with `wl_shm`,
don't get blocked on Mali client EGL.

## Related

- `docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md` — the B0/B1/B2 framing this recipe slots into; this learning is the concrete B2/C+D proof point.
- `docs/solutions/workflow-issues/non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md` — the recon-without-flashing posture that this Wayland validation rides on.
- `docs/solutions/best-practices/manual-steam-game-launching-rocknix-arm64-2026-05-04.md` — sibling ROCKNIX-class runtime work where the same read-only-root and vendor-blob constraints apply.
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md` — the guest-only Nix deploy pattern this stack inherits.
- JeffyCN's `libmali` mirror: `https://github.com/JeffyCN/mirrors/tree/libmali/lib/aarch64-linux-gnu` — the canonical mirror for ARM Mali userspace blobs across RK SoCs.
