---
title: Odin Electrobun needs a compatible WebKitGTK runtime, not just the arm64 launcher
module: Korri Odin Electrobun deployment
date: 2026-05-04
last_updated: 2026-05-04
category: docs/solutions/integration-issues
problem_type: integration_issue
component: tooling
symptoms:
  - Electrobun opened a focused Korri window on the Odin but rendered a white screen.
  - Logs showed `Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...`.
  - ROCKNIX lacked `libwebkit2gtk-4.1.so.0`, `libjavascriptcoregtk-4.1.so.0`, and `libayatana-appindicator3.so.1`.
  - Adding a full Nix closure to `LD_LIBRARY_PATH` made Electrobun's bundled Bun segfault.
  - The final WebKitGTK path rendered but felt less fluid than Chromium kiosk scrolling.
root_cause: incomplete_setup
resolution_type: environment_setup
severity: high
tags: [electrobun, odin, rocknix, webkitgtk, nix, proot, egl, white-screen]
---

# Odin Electrobun needs a compatible WebKitGTK runtime, not just the arm64 launcher

## Problem

Korri's Electrobun app could be built and launched on the AYN Odin 2 Portal under ROCKNIX, but the first visible result was a white native window. The bundled portal and loopback API were healthy; the failure was in the GTK/WebKit runtime used by Electrobun's Linux native wrapper.

This is separate from the earlier flat-bundle issue. A complete Electrobun bundle can still render white if the device's WebKitGTK/EGL stack is incompatible.

## Symptoms

- `bun x electrobun build` on the Odin downloaded Linux arm64 Electrobun CLI/core artifacts, then printed `Bundle failed`.
- Backfilling `Resources/app/bun/index.js`, `Resources/app/views/mainview/index.html`, `Resources/version.json`, and `Resources/build.json` produced a complete flat bundle.
- `ldd bin/libNativeWrapper.so` initially reported missing runtime libraries:

  ```text
  libwebkit2gtk-4.1.so.0 => not found
  libsoup-3.0.so.0 => not found
  libjavascriptcoregtk-4.1.so.0 => not found
  libayatana-appindicator3.so.1 => not found
  ```

- Staging WebKitGTK 2.50.x/2.52.x from current Nixpkgs let the window open, but the WebKit web process aborted with:

  ```text
  Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
  ```

- The app's loopback server still worked while the window was white:

  ```text
  GET /api/health -> {"status":"ok", ...}
  app.library.list -> 51 games
  ```

- Adding every Nix runtime library to `LD_LIBRARY_PATH` caused Electrobun's bundled Bun itself to segfault because it picked up an incompatible glibc/library set.

## What Didn't Work

- **Treating the Odin as if it had a normal `/nix/store`.** The ROCKNIX image had no real `/nix`, no `nix` on `PATH`, and no `/storage/.nix-profile`. It did have `/storage/.nix-portable`, but normal flake builds still assumed canonical `/nix/store` paths.
- **Using `NIX_STORE_DIR=/storage/.nix-portable/nix/store` directly.** Flake evaluation and path validity checks still produced paths that Nix did not consider in-store.
- **Putting the full runtime closure in `LD_LIBRARY_PATH`.** This fixed some `dlopen` lookup errors but made `bin/bun --version` segfault once glibc and low-level Nix libraries appeared ahead of ROCKNIX system libraries.
- **Using current WebKitGTK from Nixpkgs.** Newer WebKitGTK created the window and network process but died at EGL display creation, leaving a white screen.
- **Forcing Xwayland or common WebKit flags only.** `GDK_BACKEND=x11`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`, and `WEBKIT_DISABLE_COMPOSITING_MODE=1` did not fix the EGL abort with newer WebKitGTK.
- **Re-enabling WebKit compositing on the older WebKitGTK runtime.** WebKitGTK 2.44.3 loaded Korri with `LIBGL_DRIVERS_PATH=/usr/lib/dri`, `MESA_LOADER_DRIVER_OVERRIDE=msm`, and compositing enabled, but the process later aborted with signal 6 after DRI/GBM failures.
- **Binding `/dev` and `/run` into `proot`.** `proot` could see `/dev/dri/renderD128`, but WebKit still logged `Failed to create GBM device for render device: /dev/dri/renderD128: No such file or directory`, likely because the WebKit content process and mixed runtime stack did not share a coherent graphics view.
- **Preloading ROCKNIX GL/GBM/DRM libraries into the Nix-backed Bun process.** `LD_PRELOAD=/usr/lib/libEGL.so.1:/usr/lib/libGL.so.1:/usr/lib/libgbm.so.1:/usr/lib/libdrm.so.2` failed because Bun then needed additional system GL dependencies such as `libGLdispatch.so.0`, `libGLX.so.0`, `libOpenGL.so.0`, and `libX11.so.6`; broadening to `LD_LIBRARY_PATH=/usr/lib:/lib` exited unsuccessfully. This confirmed that launch flags cannot make a mixed Nix/ROCKNIX graphics stack coherent.

## Solution

Use the Odin's portable Nix store only as a staged runtime library source, bind it to `/nix/store` with `proot`, and avoid global `LD_LIBRARY_PATH` for the Electrobun process. The working path used WebKitGTK 2.44.3 from `nixos-24.05`, because newer WebKitGTK builds hit the EGL white-screen failure on this ROCKNIX/Sway environment.

### 1. Build the portal and backfill Electrobun's flat bundle

On the Odin:

```bash
cd /storage/korri
/storage/bin/bun run vite build --mode production
/storage/bin/bun x electrobun build || true

app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"
mkdir -p "$app_bundle/Resources/app/bun" \
  "$app_bundle/Resources/app/views/mainview"

/storage/bin/bun build korri/deploy/desktop/index.ts \
  --target bun \
  --outdir "$app_bundle/Resources/app/bun"

cp -R out/build/portal/. "$app_bundle/Resources/app/views/mainview/"
cat > "$app_bundle/Resources/version.json" <<'JSON'
{"version":"1.0.0","hash":"dev","channel":"dev","baseUrl":"","name":"Korri","identifier":"dev.korri.desktop"}
JSON
cat > "$app_bundle/Resources/build.json" <<'JSON'
{"defaultRenderer":"native","availableRenderers":["native"],"runtime":{},"bunVersion":"1.3.13"}
JSON
```

This is the same flat-bundle recovery documented in `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md`, but performed on the Odin's arm64 bundle.

### 2. Stage a compatible WebKitGTK closure

On the dev machine, fetch the older aarch64 WebKitGTK runtime and copy its closure into the Odin's portable store:

```bash
old_webkit="$(nix build --print-out-paths \
  github:NixOS/nixpkgs/nixos-24.05#legacyPackages.aarch64-linux.webkitgtk_4_1 \
  --no-link \
  --option extra-platforms aarch64-linux)"
old_appindicator="$(nix build --print-out-paths \
  github:NixOS/nixpkgs/nixos-24.05#legacyPackages.aarch64-linux.libayatana-appindicator \
  --no-link \
  --option extra-platforms aarch64-linux)"

nix-store -qR "$old_webkit" "$old_appindicator" \
  > /tmp/korri-odin-runtime-closure-2405.txt
sed 's#^/nix/store/##' /tmp/korri-odin-runtime-closure-2405.txt \
  > /tmp/korri-odin-runtime-closure-2405-relative.txt

rsync -ar --relative \
  --files-from=/tmp/korri-odin-runtime-closure-2405-relative.txt \
  /nix/store/ \
  root@sm8550:/storage/.nix-portable/nix/store/
```

The staged closure was large, around 1.2 GiB, but `/storage` had enough free space.

### 3. Put WebKit paths in `libNativeWrapper.so` RPATH, not process-wide `LD_LIBRARY_PATH`

Create an RPATH using canonical `/nix/store/.../lib` paths, then patch only the native wrapper:

```bash
awk '{printf "%s%s/lib", sep, $0; sep=":"}' \
  /tmp/korri-odin-runtime-closure-2405.txt \
  > /tmp/korri-odin-runtime-rpath-2405.txt
scp /tmp/korri-odin-runtime-rpath-2405.txt \
  root@sm8550:/storage/korri-runtime-rpath-2405.txt
```

On the Odin:

```bash
cd /storage/korri
app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"
wrapper="$app_bundle/bin/libNativeWrapper.so"

cp -n "$wrapper" "$wrapper.pre-rpath-backup"
patchelf --set-rpath \
  "$app_bundle/bin:$(cat /storage/korri-runtime-rpath-2405.txt)" \
  "$wrapper"

/storage/.nix-portable/bin/proot \
  -b /storage/.nix-portable/nix/store:/nix/store \
  /bin/sh -c "ldd /storage/korri/$wrapper" \
  | grep -i 'not found' || true
```

The important detail is that the dynamic dependencies inside `libNativeWrapper.so` resolve through RPATH under `/nix/store`, while Electrobun's launcher process does not inherit a giant Nix `LD_LIBRARY_PATH`.

### 4. Patch the bundled Bun interpreter to a staged Nix dynamic linker

Because the native wrapper loads Nix-built WebKit libraries, the Bun process that calls `dlopen` must also run under a compatible glibc interpreter when `/nix/store` is bound with `proot`:

```bash
cd /storage/korri
app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"
bun_bin="$app_bundle/bin/bun"

cp -n "$bun_bin" "$bun_bin.rocknix-loader-backup"
patchelf --set-interpreter \
  /nix/store/99al6q9wd3jg1qs43fvmllx7vakazm8x-glibc-2.42-51/lib/ld-linux-aarch64.so.1 \
  "$bun_bin"
```

That exact glibc path came from the first staged runtime attempt in this session. Durable tooling should derive the interpreter path from the staged closure instead of hard-coding it.

### 5. Launch through `proot` with `essway.service` runtime-masked

```bash
systemctl --runtime mask essway.service
systemctl stop essway.service || true

cd /storage/korri
app_bundle="$(find out/build/electrobun -path '*/Korri-dev' -type d | head -n 1)"

set -a
. /storage/korri/.env
set +a

unset LD_LIBRARY_PATH
export XDG_DATA_DIRS="/nix/store/3yh7pf28k83r8am674lf4kz6gxqis9sw-gsettings-desktop-schemas-46.0/share:/nix/store/x4cz12bnhc3znyjl2my6wdz65dnvfzxx-gtk+3-3.24.43/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
export GDK_BACKEND=wayland
export GSK_RENDERER=cairo
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export KORRI_ROCKNIX_GAMELIST_ROOTS="${KORRI_ROCKNIX_GAMELIST_ROOTS:-/storage/roms}"

setsid /storage/.nix-portable/bin/proot \
  -b /storage/.nix-portable/nix/store:/nix/store \
  "$app_bundle/bin/launcher" \
  >> /storage/korri-electrobun-session.log 2>&1 < /dev/null &
echo $! > /storage/korri-electrobun.pid
```

Verification signs:

```text
=== ELECTROBUN NATIVE WRAPPER VERSION 1.0.2 === GTK EVENT LOOP STARTED ===
DEBUG: First webview (ID: 1) realized successfully
Korri desktop app started
WebKitWebProcess ... running
```

And from the Odin:

```bash
curl -fsS http://127.0.0.1:<korri-port>/api/health
LOCAL_BASE=http://127.0.0.1:<korri-port> /storage/bin/bun run <rpc-smoke-script>
```

The session verified `/api/health`, `app.library.list`, and a visible focused Sway window titled `Korri`.

## Why This Works

Electrobun's Linux launcher is not enough on ROCKNIX. The launcher is statically linked, but `Resources/main.js` calls Bun FFI `dlopen` on `bin/libNativeWrapper.so`; that shared object then needs GTK, WebKitGTK, JavaScriptCoreGTK, libsoup, AppIndicator, Mesa/GBM, and related libraries.

ROCKNIX shipped some GTK libraries but not the WebKitGTK stack Electrobun expects. Staging a Nix closure supplies those libraries without mutating the immutable root filesystem.

The subtle part is library scope:

- `LD_LIBRARY_PATH=<entire Nix closure>` affects every dynamic lookup in the Bun process and caused Bun to segfault.
- `RPATH` on `libNativeWrapper.so` narrows the Nix lookup surface to the native wrapper and its descendants.
- `proot -b /storage/.nix-portable/nix/store:/nix/store` makes Nix-built absolute paths valid without requiring a writable real `/nix` mount.
- WebKitGTK 2.44.3 avoids the `EGL_BAD_PARAMETER` web-process abort seen with newer WebKitGTK builds on this Odin/ROCKNIX/Sway stack.

This gets Electrobun rendering, but it is not the same performance envelope as Chromium kiosk. The working path still uses `proot`, GTK/WebKitGTK, and conservative rendering flags; scrolling can feel less fluid than Chromium's hardware-accelerated kiosk path.

ROCKNIX Layer 8 changes the next experiment: Korri should now use real `/nix` and a Nix-managed `korri-desktop-odin` app instead of staging closures under `/storage/.nix-portable`. The acceptance bar does not change. Electrobun only becomes a production renderer if it passes on-device GPU acceptance without `GSK_RENDERER=cairo`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, or `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

The follow-up GPU experiments showed that the next performance boundary is architectural, not another environment variable. A mandatory GPU-accelerated Electrobun path needs a coherent native graphics stack: Electrobun's native wrapper, WebKitGTK, Mesa/GBM/EGL, DRI drivers, Sway/Wayland, and the WebKit content process must all come from the same ROCKNIX-compatible runtime rather than mixing Nix WebKit with ROCKNIX Mesa through `proot`.

## Prevention

- For new work, use the Layer 8 preflight/smoke path:
  1. real `/nix` and Nix-managed app readiness (`just odin-desktop-preflight`),
  2. bundle/server/WebKit/Sway liveness (`just check-odin-electrobun`),
  3. GPU acceptance with positive device-screen/log evidence and no forbidden fallback flags.
- Keep the older staged-runtime checklist only for historical debugging:
  1. bundle completeness (`Resources/app/bun/index.js`, `views/mainview/index.html`, `version.json`, `build.json`),
  2. native wrapper `ldd` under `proot` with no missing libraries,
  3. actual WebKit process survival (`WebKitWebProcess` remains alive after loading `/`).
- Do not treat `GET /` or `/api/health` as proof that the webview rendered. The server can be healthy while WebKit is white.
- Avoid process-wide Nix `LD_LIBRARY_PATH` for Electrobun on ROCKNIX. Patch RPATH on the specific shared object that needs the staged closure.
- Pin the Odin WebKitGTK runtime until a newer build is proven on-device. Current Nixpkgs WebKitGTK reproduced the white-screen/EGL abort; `nixos-24.05` WebKitGTK 2.44.3 rendered.
- Keep Chromium kiosk as the default production renderer until Electrobun is tested without `proot` and with a real hardware-rendering path.
- If GPU acceleration is mandatory, do not spend more time on staged-Nix launch-profile tuning. Move to a more native track: package WebKitGTK/Electrobun inside ROCKNIX, build Electrobun's native wrapper against a ROCKNIX sysroot, or switch the renderer shell to a ROCKNIX-native accelerated runtime such as Chromium/Cog/WPE with Korri-owned sidecar APIs.
- Always provide a stop/restore path when masking EmulationStation:

  ```bash
  kill "$(cat /storage/korri-electrobun.pid)" 2>/dev/null || true
  pkill -f 'Korri-dev/bin/launcher|Resources/main.js|WebKit' 2>/dev/null || true
  systemctl unmask essway.service
  systemctl restart essway.service
  ```

## Related Issues

- `docs/solutions/integration-issues/electrobun-linux-flat-bundle-2026-05-01.md` — covers the missing `Resources/app/bun/index.js`, `version.json`, and `build.json` problem that must be fixed before runtime rendering can be debugged.
- `docs/solutions/best-practices/electrobun-desktop-wrapper-loopback-2026-05-01.md` — explains why the desktop app serves portal assets and RPC through one loopback HTTP origin.
- `docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md` — documents the reversible `essway.service` runtime-mask pattern used before launching Korri.
- `docs/plans/2026-05-03-001-feat-odin-electrobun-build-plan.md` — original plan for the Odin Electrobun launch path; this solution documents what the implementation discovered about portable Nix, WebKitGTK, and rendering.
