---
module: nix/korri-desktop
date: 2026-05-27
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - "Running an Electrobun (Bun + native-WebView) desktop app on an aarch64 handheld whose stock OS has no usable /nix and a glibc older than 2.38"
  - "The app needs a webkit2gtk-4.1 / GTK3 / glib / libsoup stack newer than the device's system libraries"
  - "The runtime is launched under a Wayland compositor (e.g. cage) whose own LD_LIBRARY_PATH would poison child processes"
  - "Upstream Electrobun aarch64 prebuilts (launcher, libNativeWrapper.so, libasar.so) must be reused on an x86-built bundle"
  - "Persistent storage on the device is an ext4 SD card mounted via bwrap as /nix at runtime"
tags:
  - electrobun
  - aarch64
  - webkit2gtk
  - nix-closure
  - bwrap
  - handheld
related_components:
  - development_workflow
---

# Electrobun renderer on an aarch64 handheld via a cohesive nix closure

## Context

KORRI's portal renderer is Electrobun on Linux: a tiny static `launcher`
binary spawning `bun` as its bootstrap, with `bun` loading
`libNativeWrapper.so` to drive a **GTK3 + webkit2gtk-4.1** webview. CEF vs
WebKit is purely a renderer-process swap inside this stack — the host side
is GTK3 either way. That is a ~332-path nixpkgs-24.05 closure (~1.2 GB
unpacked) that has to be made to run on an EmuELEC 4.7-Nexus device with
**glibc 2.36**, **970 MB RAM**, **3.7 GB eMMC**, and a **Mali-G31 vendor
blob** that has already been moved to a 2024-era release by the sibling
cage work.

The pieces alone were already solved by prior learnings:

- A cage compositor exists, driving DSI through the newer libmali on
  Mali-G31 — see
  [wayland-userspace-on-mali-g31-handheld-via-newer-libmali](./wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md).
- An aarch64 Bun runs the KORRI api server as a single-file bundle using
  the device's own glibc 2.36 — see
  [korri-api-on-aarch64-handheld-via-bun-bundle](./korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md).
- The staging arc (B0 → B7) gives us permission to ship a heavier
  Nix-built tree as long as it stays on the SD-class writable surface —
  see
  [staged-layer-adoption-for-constrained-handheld-bringup](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md).

**This learning is the chaining.** It is the recipe for landing the
GTK3 + webkit2gtk renderer on top of those three, in an envelope that
holds 189 MB RSS and survives reboots — and it is the inventory of the
five concrete things you have to add **on top of the prior recipes** to
make the chain hold:

1. A **cohesive nixpkgs-24.05 closure** built as one `buildEnv`, not a
   union of paths pulled from multiple nixpkgs generations.
2. A **closure-restricted `LD_LIBRARY_PATH`** computed from
   `nix-store --query --requisites <aggregator>`, never from
   `for d in /nix/store/*/lib`.
3. An **argv0-spoofing `bun` wrapper** that calls the closure's
   `ld-linux-aarch64.so.1` directly with `--argv0` preserved.
4. An **`unset LD_LIBRARY_PATH` env-reset across the cage→child exec
   boundary**, because cage runs against a different (newer) closure
   than the renderer.
5. A `bwrap` encapsulation that binds `/storage/nix` at `/nix` and pairs
   every run with a 180 s EmulationStation safety-net timer.

If any one of those five is wrong, the failure modes look like unrelated
bugs in five different libraries. They are not. They are the same problem
— the loader resolving symbols out of the wrong glibc generation —
wearing five different costumes.

## Guidance

### 1. Build one cohesive `buildEnv` aggregator on an aarch64 builder; do not graft closures together on the device

The temptation is to install the things you need (`webkitgtk_4_1`,
`gtk3`, `libsoup_3`, …) one at a time and let `LD_LIBRARY_PATH` stitch
them together at runtime. **Don't.** Each `nix profile install` may pull
a slightly different `glib`, `libgcrypt`, or `libgpg-error`, and the
loader picks the first `.so` it finds — which is rarely the one whose
ABI matches the rest of the closure.

The right shape is one `buildEnv` derivation built on a single nixpkgs
revision, deployed as one transferable closure:

```nix
# nix/portal/electrobun-runtime-closure.nix
{ pkgs ? import <nixpkgs-24.05> {} }:
pkgs.buildEnv {
  name = "korri-electrobun-runtime";
  ignoreCollisions = true;
  paths = [
    pkgs.webkitgtk_4_1
    pkgs.gtk3
    pkgs.libsoup_3
    pkgs.glib
    pkgs.gdk-pixbuf
    pkgs.cairo
    pkgs.pango
    pkgs.libayatana-appindicator
    pkgs.librsvg
    pkgs.at-spi2-core
    pkgs.glib-networking
    pkgs.gsettings-desktop-schemas
    pkgs.stdenv.cc.cc.lib
  ];
}
```

- `ignoreCollisions = true` is required: `glib`, `libsoup`, `gtk3`, and
  `gdk-pixbuf` all share a few sentinel files
  (`share/glib-2.0/…`, etc.). The collision is *symlink-vs-symlink* in
  `buildEnv`'s output and has no runtime effect; the underlying store
  paths are intact.
- Pick a frozen channel like `nixos-24.05` and commit the lockfile.
  Mixing 24.05 with `nixpkgs-unstable` is what produces the
  `libgcrypt → libgpg-error → gpgrt_add_post_log_func` symbol error
  from §3 below.
- `stdenv.cc.cc.lib` is what supplies `libstdc++` and `libgcc_s`. It is
  easy to forget because it is "the toolchain library"; the renderer
  fails with a quietly inscrutable `cannot allocate memory in static
  TLS block` without it.

Transfer to the device the same way the sibling api recipe transfers
binaries — `nix-store --export | ssh device cat > /storage/nix.nar` on
a builder you trust. On the fuji builder we measured **283 s** for the
332-path closure, 1.8 GB landed on `/storage/nix`.

### 2. Compute `LD_LIBRARY_PATH` from the aggregator's transitive requisites — never from `find /nix/store -type d -name lib`

This is the single highest-leverage rule in the recipe. The naive
fallback path is:

```sh
# DO NOT DO THIS
for d in /storage/nix/store/*/lib; do
  LD_LIBRARY_PATH="$d:$LD_LIBRARY_PATH"
done
```

On a device that also has cage's own closure installed (a different
nixpkgs revision), this collects ~467 directories. The loader walks them
in order, picks the first `libgcrypt.so.20` it finds — and that copy was
linked against a `libgpg-error` from a generation that does *not* live
in the renderer's closure. You get:

```text
/storage/nix/store/…libgcrypt-1.11.2/lib/libgcrypt.so.20:
  undefined symbol: gpgrt_add_post_log_func, version GPG_ERROR_1.0
```

The fix is to derive the LD path from the aggregator's transitive
closure, computed on the builder once, shipped as a static list:

```sh
# On the builder, after building the aggregator:
COH=$(nix-build nix/portal/electrobun-runtime-closure.nix --no-out-link)
nix-store --query --requisites "$COH" > /tmp/cohesive-paths.txt
# 332 lines. Ship to device.

# On device, filter to paths that actually have a lib/ with .so files:
LD_LIBRARY_PATH=$(
  while read -r p; do
    [ -d "$p/lib" ] && \
      ls "$p"/lib/*.so* >/dev/null 2>&1 && \
      printf '%s/lib:' "$p"
  done < /storage/cohesive-paths.txt
)
LD_LIBRARY_PATH="${LD_LIBRARY_PATH%:}"
# → 287 directories on R36T MAX after the empty-lib filter.
```

287 dirs, all from one nixpkgs generation. The loader cannot accidentally
cross generations because the cross-generation paths are not in the list.

Two specific gotchas this rule fixes:

- `libNativeWrapper.so: libglib-2.0.so.0: cannot open shared object file`.
  The buildEnv aggregator drops `libglib`'s symlink under collision; the
  underlying glib-2.80.2 store path still exists and carries the file,
  but only if `LD_LIBRARY_PATH` references *that path* directly, not the
  aggregator's `lib/` directory.
- `libgcrypt undefined symbol: gpgrt_add_post_log_func`. Solved by
  excluding cage's `libgcrypt` entirely from this LD path — cage's
  closure is loaded separately, by cage's *own* launcher, before the
  env-reset boundary in §4.

### 3. Spoof `argv[0]` when invoking the closure's loader so Electrobun's `main.js` finds itself

Electrobun's `Resources/main.js` does `path.dirname(process.argv0)` to
find `libNativeWrapper.so` next to `bun`. The `bun` in the bundle has to
be aarch64, which means it has to satisfy the closure's glibc 2.39+ (not
the device's 2.36). You cannot just `patchelf --set-interpreter` the
closure's `ld-linux` into the bundled bun — the bun upstream binary is
statically position-aware and the patchelf flow has been brittle against
newer bun releases.

The shim that works is a shell wrapper at the path Electrobun expects
(`<bundle>/bin/bun`):

```sh
#!/bin/sh
# /storage/eb-hello-world-arm64/bin/bun
set -e

BUNDLE=/storage/eb-hello-world-arm64
CLOSURE_LD=/storage/nix/store/27fg…-glibc-2.39-52/lib/ld-linux-aarch64.so.1
REAL_BUN=/storage/bin/bun

# Build LD path from the cohesive list shipped alongside the bundle.
LD="$BUNDLE/bin"
while read -r p; do
  [ -d "$p/lib" ] && ls "$p"/lib/*.so* >/dev/null 2>&1 \
    && LD="$LD:$p/lib"
done < /storage/cohesive-paths.txt

exec "$CLOSURE_LD" \
  --argv0        "$BUNDLE/bin/bun" \
  --library-path "$LD" \
  "$REAL_BUN" "$@"
```

Three things make this work:

- `--argv0 "$BUNDLE/bin/bun"`. Electrobun's `main.js` reads
  `process.argv0` and walks to `libNativeWrapper.so`. Without `--argv0`,
  the loader sets argv[0] to `$REAL_BUN` (`/storage/bin/bun`), the
  dirname lookup misses `libNativeWrapper.so`, and you get an opaque
  `Cannot find module` out of bun before anything renders.
- `--library-path` (passed directly to the loader, not exported as
  `LD_LIBRARY_PATH`). This makes the loader use *only* the listed paths,
  bypassing any `LD_LIBRARY_PATH` cage may have inherited from its own
  closure. It is the same fix as §4, scoped tighter.
- `exec` of the closure's `ld-linux-aarch64.so.1` directly, not via
  patchelf, sidesteps the entire `--set-interpreter` flow. The on-disk
  bun stays a vanilla upstream binary; the closure's loader is what
  gives it its libc.

The exact glibc path on the device today:
`/storage/nix/store/27fghpz6vjss7zsdhz1gwvvfsj98azpw-glibc-2.39-52/lib/ld-linux-aarch64.so.1`.
Pin it in a small `runtime-paths.env` file shipped next to the cohesive
list so the wrapper has a single point of truth.

### 4. Reset `LD_LIBRARY_PATH` across the cage→child boundary; cage runs against a different closure than the renderer

Cage in our deployment comes from `nixpkgs-unstable` (its newer wlroots
is required for the Mali GBM path). The renderer comes from
`nixpkgs-24.05`. **Two different glibcs are present on the device, in
two different closures.**

Cage exports its own `LD_LIBRARY_PATH` (pointing at cage's closure) when
it execs its child. If you let the child inherit that, the child's
busybox-shipped `/bin/sh` — which is the device's own glibc 2.36 — gets
handed an `LD_LIBRARY_PATH` that points at glibc 2.42, and the very
first `sh -c …` dies with:

```text
sh: relocation error: /storage/nix/store/…glibc-2.42-…/lib/libc.so.6:
  symbol __tunable_is_initialized, version GLIBC_PRIVATE not defined
  in file ld-linux-aarch64.so.1 with link time reference
```

The fix is to make the cage launcher exec the closure's `bash` with an
explicit `unset LD_LIBRARY_PATH` as the first thing the child does, and
only *then* set the renderer's own environment:

```sh
#!/bin/sh
# /storage/launch-portal.sh — invoked by sessiond, lives outside bwrap.

CAGE=/nix/store/…cage-0.2.1/bin/.cage-wrapped
WLLIB=/nix/store/…wayland-1.24.0/lib
GLIBC_CAGE=/nix/store/…glibc-2.42-…/lib
GCCLIB_CAGE=/nix/store/…gcc-15.2.0-lib/lib
CLOSURE_BASH=/storage/nix/store/…bash-interactive-…/bin/bash

mkdir -p /tmp/wayland; chmod 700 /tmp/wayland

LD_LIBRARY_PATH="$WLLIB:$GCCLIB_CAGE:$GLIBC_CAGE" \
LIBSEAT_BACKEND=builtin \
XDG_RUNTIME_DIR=/tmp/wayland \
WLR_BACKENDS=drm \
WLR_DRM_DEVICES=/dev/dri/card0 \
WLR_RENDERER=gles2 \
exec "$CAGE" -D -- "$CLOSURE_BASH" -c '
  unset LD_LIBRARY_PATH
  export HOME=/storage
  export WAYLAND_DISPLAY=wayland-0
  export XDG_RUNTIME_DIR=/tmp/wayland
  export GDK_BACKEND=wayland
  exec /storage/eb-hello-world-arm64/bin/launcher
'
```

What is happening, line by line:

1. The outer shell exports cage's `LD_LIBRARY_PATH`. Cage uses it, loads
   wlroots and its own glibc, comes up.
2. Cage `exec`s the closure's `bash` (not the device's busybox `sh`).
   Closure bash is dynamically linked against the *renderer's* glibc
   2.39, so it does not care about the inherited cage-closure
   `LD_LIBRARY_PATH` — but its children will, so:
3. The first thing closure-bash does inside `-c '…'` is
   `unset LD_LIBRARY_PATH`. The cage env is gone; the renderer process
   now starts with a clean environment.
4. The renderer env is re-exported: `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`,
   `GDK_BACKEND`. No `LD_LIBRARY_PATH` here — the `bun` shim from §3
   will set its own (via `--library-path`) when it execs the closure's
   loader directly.
5. `exec launcher`. Static binary, no library dependencies of its own;
   it forks `bun`, which is the shim, which is the closure ld, which
   knows the right LD path. From here it is one closure all the way
   down.

This is the single subtlest part of the recipe. If you skip the `unset`,
the failure mode is `__tunable_is_initialized` and looks like a glibc
bug. It is not — it is two closures sharing one process tree.

### 5. Encapsulate the whole stack in `bwrap` and pair every run with a 180 s ES safety net

The sibling cage learning already establishes the bwrap pattern. The
additions for this stack:

- `--bind /storage/nix /nix` *must* be present; the renderer closure is
  full of store-path absolute references (`/nix/store/…/share/…` inside
  GTK theme files, GSettings schemas, etc.) that cannot be rewritten.
- `--bind /tmp /tmp` matters because the Wayland socket lives at
  `/tmp/wayland/wayland-0`, the closure's GLib creates lock files in
  `/tmp`, and webkit2gtk's network process writes its socketpair
  control there.
- `--bind /run /run` is needed for `dbus` even when dbus is not running:
  webkitgtk probes `/run/dbus/system_bus_socket`. Letting the probe fail
  cleanly is fine; making it explode on a missing bind is not.

The recovery timer is the same shape as the cage recipe but at a longer
interval — Electrobun's first run does first-paint within ~25 s on
R36T MAX, and we want margin for a slow eMMC after a cold boot:

```sh
systemd-run --on-active=180s --unit=korri-es-recover-$$ \
  systemctl start emustation.service
# ...run the bwrap pipeline...
# on visible success:
systemctl stop korri-es-recover-$$.timer
systemctl reset-failed korri-es-recover-$$.timer
```

### 6. Bundle assembly: cross-build on x86_64, then swap eight binaries for aarch64

`electrobun build` does not cross-compile cleanly to aarch64 from x86_64
hosts. The workable flow is to do the bundle on Linux x86 and then
surgically swap arch-specific binaries from the upstream aarch64
prebuilts:

```sh
# 1. Build the host bundle (x86 yuki).
bun electrobun build
# → build/dev-linux-x64/hello-world-dev/{bin,Resources}

# 2. Clone, target aarch64.
cp -a build/dev-linux-x64/hello-world-dev build/dist-linux-arm64

# 3. Pull upstream aarch64 prebuilts.
URL=https://github.com/blackboardsh/electrobun/releases/download/v1.16.0
mkdir -p /tmp/eb-arm
cd /tmp/eb-arm
for t in cli core cef; do
  curl -sL -o $t.tgz "$URL/electrobun-$t-linux-arm64.tar.gz"
  mkdir -p $t && tar xf $t.tgz -C $t
done

# 4. Swap eight arch-specific binaries.
DIST=$REPO/build/dist-linux-arm64
for f in launcher bun libNativeWrapper.so libasar.so bspatch \
         zig-zstd process_helper extractor; do
  cp -v /tmp/eb-arm/core/bin/$f "$DIST/bin/$f"
done
chmod +x "$DIST/bin/"*

# 5. Replace bin/bun with the shim from §3 (saving the upstream bun
#    aside as bin/bun.real if you want the closure-loader path).
mv "$DIST/bin/bun" "$DIST/bin/bun.real"
install -m 0755 nix/portal/eb-bun-shim.sh "$DIST/bin/bun"
```

`Resources/main.js` is portable (pure JS). Nothing else in the bundle is
arch-specific.

The eight binaries:

| File | Role |
|---|---|
| `launcher` | static aarch64 ELF; argv[0] orchestrator that spawns `bun` |
| `bun` | the runtime — replaced by the §3 shim |
| `libNativeWrapper.so` | C++ glue between Bun and webkit2gtk-4.1 (WebKit variant) |
| `libasar.so` | reads `Resources/app.asar` |
| `bspatch` | binary delta for OTA |
| `zig-zstd` | compression for OTA + assets |
| `process_helper` | renderer process helper Electrobun execs |
| `extractor` | unpacks the bundle on first run |

The CEF variant of `libNativeWrapper_cef.so` is a separate swap; we ship
the WebKit variant because the closure already carries webkit2gtk-4.1
and adding CEF would double the disk footprint.

## Why This Matters

- **The chain is the contribution.** Each prior learning solved one
  layer. The leverage in this recipe is in connecting them without any
  one layer's assumptions corrupting the next. Cage's closure must not
  leak into the renderer's closure. The renderer's loader must not leak
  into busybox's `sh`. The bundle's argv[0] must not leak through
  `exec`. Five surgical separations, one working stack.
- **Cohesive closures beat union-of-paths.** The sibling api recipe
  could get away with one bun binary against the device's own libc. The
  renderer needs ~287 cooperating libs from one nixpkgs generation. The
  technique that scales here — `buildEnv` aggregator +
  `nix-store --query --requisites` for the LD list — is the same
  technique any future GTK-class component on this device will use
  (Moonlight-Qt, sunshine-qt6 host, future portal swap).
- **189 MB RSS is the fit-or-fail number.** The R36T MAX has 970 MB of
  RAM plus 512 MB swap. The full stack (cage 57 MB, launcher 136 KB,
  WebKitNetworkProcess 42 MB, WebKitWebProcess 89 MB, bun api 71 MB)
  totals 296 MB used and leaves **594 MB available** for actual webview
  content and Moonlight decode buffers. That margin is what the
  staged-layer-adoption pattern was reserving room for.
- **The argv0 spoof is novel here.** It does not appear in any of the
  prior learnings because none of them had to make `bun` lie about
  where it lives. It will appear again the next time we ship an
  Electron-class app whose launcher walks `process.argv0`.

## When to Apply

- Running Electrobun (any version) on an aarch64 stock-OS handheld whose
  libc is older than the upstream Electrobun aarch64 prebuilts need.
- Any GTK3 + webkit2gtk renderer that needs hundreds of cooperating libs
  on a device whose `/nix` is provided by a bind mount rather than a
  stage-1 mount.
- When you have already validated the compositor layer (cage on newer
  libmali) and the api layer (Bun bundle on device libc) and the next
  thing is the renderer.
- Whenever a previously-working LD path starts failing with
  `undefined symbol … version FOO_1.0` after a closure refresh — the
  rule "derive LD from one aggregator's requisites" is the fix.

This guidance does **not** apply when:

- The device runs a modern enough libc that the upstream Electrobun
  prebuilt bun works against it directly. Skip §3.
- The compositor and the renderer share a single closure (e.g. both
  from nixpkgs-24.05). Skip §4's `unset LD_LIBRARY_PATH` boundary.
- The device boots a NixOS image with a real `/nix` mount. Skip the
  bwrap rebinds in §5; only the safety-net timer carries over. See
  [odin-electrobun-webkit-runtime-white-screen](../integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md)
  for the NixOS-on-device variant of the same family.

## Examples

### End-to-end success on R36T MAX

```text
$ ssh r36t /storage/launch-portal.sh
[cage] EGL vendor: ARM, EGL 1.5
[cage] connector DSI-1: Modesetting with 680x680 @ 60.597 Hz
[cage] Cage 0.2.1 running on wayland-0
[launcher] starting bun
[bun] === ELECTROBUN NATIVE WRAPPER VERSION 1.0.2 === GTK EVENT LOOP STARTED ===
[bun] Server started at http://localhost:50000
[bun] DEBUG: Adding first webview (ID: 1) to container
[bun] DEBUG: First webview (ID: 1) realized successfully
[bun] Hello Electrobun app started!
[bun] [GTKWebKit onDecidePolicy] url=views://mainview/index.html
```

Resources after 90 s steady state:

| Process | RSS |
|---|---:|
| cage-wrapped (compositor) | 57 MB |
| launcher (static) | 136 KB |
| bun (renderer host) | included in WebKit |
| WebKitNetworkProcess | 42 MB |
| WebKitWebProcess | 89 MB |
| **Electrobun stack subtotal** | **~189 MB** |
| bun api (sibling recipe) | 71 MB |
| **System total used** | 296 MB |
| **Available** | 594 MB |

Visible result: portal hello-world renders, no scanout fallbacks in the
cage log beyond the expected `Failed to import buffer for scan-out` GLES2
fallback documented in the cage sibling.

### Failure mode 1 — naïve LD path, mixed closures

<details>
<summary>Full failure log</summary>

```text
[launcher] starting bun
[bun] dlopen("/storage/eb-hello-world-arm64/bin/libNativeWrapper.so"):
  /storage/nix/store/…libgcrypt-1.11.2-aarch64-linux/lib/libgcrypt.so.20:
  undefined symbol: gpgrt_add_post_log_func, version GPG_ERROR_1.0
[bun] FATAL: webview backend failed to load
launcher: child exited with status 1
```

</details>

What happened: the device also had a cage `nixpkgs-unstable` closure in
`/storage/nix/store/` and the naïve `for d in /storage/nix/store/*/lib`
collected its newer `libgcrypt-1.11.2` first. The renderer's webkit2gtk
wants the `libgcrypt` from the 24.05 closure, which links against an
older `libgpg-error` that exports the missing symbol.

Fix: replace the naïve walk with the §2 cohesive-list filter. LD goes
from 467 dirs to 287, all from one generation.

### Failure mode 2 — missing argv0 spoof

<details>
<summary>Full failure log</summary>

```text
[launcher] starting bun
[bun] Cannot find module 'libNativeWrapper.so' from
  '/storage/nix/store/27fg…-glibc-2.39-52/lib/Resources/main.js'
[bun] at Module._resolveFilename (node:internal/modules/cjs/loader)
launcher: child exited with status 1
```

</details>

The closure's `ld-linux` executed bun, but argv[0] was the path of the
*loader*. Electrobun's `main.js` walked `dirname(argv0)` and looked for
`libNativeWrapper.so` under the glibc store path. Adding
`--argv0 "$BUNDLE/bin/bun"` to the loader invocation fixes it.

### Failure mode 3 — cage env leaks into the child

<details>
<summary>Full failure log</summary>

```text
[cage] launching child: bash -c '...'
sh: relocation error: /storage/nix/store/…glibc-2.42-…/lib/libc.so.6:
  symbol __tunable_is_initialized, version GLIBC_PRIVATE not defined
  in file ld-linux-aarch64.so.1 with link time reference
[cage] child exited with status 127
```

</details>

`bash` here was the device's busybox `sh`, invoked because the cage
launcher used `-- bash -c '…'` and PATH resolved `bash` to busybox.
Busybox is the device's glibc 2.36; it inherited cage's
`LD_LIBRARY_PATH` pointing at the closure's glibc 2.42 and tried to load
it. The two glibcs do not share `GLIBC_PRIVATE` symbols.

Fix: invoke the closure's `bash` explicitly (`$CLOSURE_BASH`), then
`unset LD_LIBRARY_PATH` as the first command inside its `-c`. The
boundary is now clean.

### Failure mode 4 — closure tar overwrites the libmali redirect

This is inherited from the cage sibling but worth restating: each time
you ship a fresh closure tarball that includes the closure's `libglvnd`
/ `mesa-libgbm` paths, the tar overwrites the symlinks that redirect
`libEGL.so.1` / `libgbm.so.1` / `libGLESv2.so.2` at
`/storage/lib/libmali-g24p0.so`. Re-apply the redirect after every
closure refresh, or you will see the renderer come up but cage will
fall back to no-GPU output.

### Failure mode 5 — `Gtk-WARNING: cannot open display: :99`

Means the renderer process inherited an X11 `DISPLAY` env var from the
bwrap parent and tried X11 first. Add `--unsetenv DISPLAY` to the bwrap
invocation, or `unset DISPLAY` inside the closure-bash heredoc next to
the `unset LD_LIBRARY_PATH`.

## Related

- [`../best-practices/wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md`](./wayland-userspace-on-mali-g31-handheld-via-newer-libmali-2026-05-27.md) — the cage + libmali stack this Electrobun runtime layers on top of (same device, same day).
- [`../integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md`](../integration-issues/odin-electrobun-webkit-runtime-white-screen-2026-05-04.md) — direct predecessor: cohesive pkgs2405 webkit2gtk 2.44.3 closure and why it must move as a unit. This new doc is the no-NixOS variant of that approach.
- [`../best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md`](./korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md) — the api half of the same R36T MAX runtime; the renderer in this doc talks to that bundle over loopback.
- [`../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md`](../architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md) — the B0/B1/B2/B3 framing; this recipe is the concrete B3-renderer proof point on R36T MAX.
- [`../integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`](../integration-issues/electrobun-linux-flat-bundle-2026-05-01.md) — prerequisite flat-bundle backfill that any Electrobun-on-device recipe must still apply.
- [`../workflow-issues/non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md`](../workflow-issues/non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md) — recon-before-runtime posture and the libmali / DRM-master facts this recipe rides on.
- [`../best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md`](./electrobun-desktop-wrapper-loopback-2026-05-01.md) — same-origin HTTP contract the wrapped renderer must continue to honor on-device.
- [`../workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`](../workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md) — sibling guest-only deploy via nix-on-rocks; contrast point for the "no-Nix-on-device" path documented here.
- Electrobun upstream: <https://github.com/blackboardsh/electrobun/releases/tag/v1.16.0>
- nixpkgs `buildEnv` reference: <https://nixos.org/manual/nixpkgs/stable/#sec-building-environment>
- `ld-linux.so` manual (`--argv0`, `--library-path`): <https://man7.org/linux/man-pages/man8/ld.so.8.html>
