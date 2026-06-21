# Yoshi's Fabrication Station browser runtime capture

Date: 2026-06-04

## Goal

Run Yoshi's Fabrication Station on Korri devices with:

- direct launch into a level/sample/code
- scoped controller-to-keyboard input
- no global InputPlumber profile switching
- ideally no background HTTP server for the shipped path
- 60fps+ gameplay
- acceptable memory footprint

## Upstream payload

- ZIP: `/home/simonwjackson/Downloads/YFSv3.13.1.zip`
- Extracted root: `/home/simonwjackson/Downloads/YFSv3.13.1`
- Web root: `/home/simonwjackson/Downloads/YFSv3.13.1/www`
- Version: `s3.13.1`
- ZIP SHA256: `4e69ae9f18e8d326a9603234713f5603affdb89b6ca5a4c8d1d01770cd2540ca`

Key files inspected:

- `www/data.json`
- `www/samplelevels.json`
- `www/scripts/c3main.js`
- `www/scripts/main.js`
- `www/index.html`
- `package.json`

## Direct-launch seam

The useful existing YFS flow is:

1. `GameBootEvents` loads JSON assets.
2. Title screen routes into `LoadLevel`.
3. `LoadLevelEvents` reads `LevelCodeBox.Text`.
4. `checkLevelCode()` validates the pasted JSON/string.
5. Valid code lands in `LevelCodeJSON`.
6. Play globals are set.
7. Layout switches to `Level`.
8. `EditorEvents.loadLevelFromJSON()` builds and starts play mode.

Current prototype uses DOM automation around that seam:

- `?sample=basicMovement`
- `?sample=shyGuys`
- `?sample=tapTap`
- `?code_url=...`
- `#code_b64=...`
- sessionStorage pasted-code launch

Long-term cleaner patch: read launch params early, call `validateLevelCode(JSONString)`, set `LevelCodeJSON`, set play globals, and go directly to `Level` without DOM clicking.

## Browser/runtime findings

### file://

`file://` is not viable in Luakit/WebKit:

```text
Origin null is not allowed by Access-Control-Allow-Origin
```

Chromium can run `file://` if launched with:

```bash
--allow-file-access-from-files
```

### Luakit + custom yfs:// scheme

A no-server Luakit custom scheme works:

```text
yfs://app/index.html?sample=basicMovement
```

Prototype files on Sobo:

- `/tmp/yfs-scheme-luakit-config/luakit/userconf.lua`
- `/tmp/yfs-scheme-evsieve-prototype.sh`
- `/tmp/yfs-scheme-luakit.log`
- `/tmp/yfs-evsieve.log`

Important settings:

```lua
settings.webview.enable_webgl = true
settings.webview.enable_webaudio = true
```

Performance:

- WebGL 2 works.
- Baseline around `38–40fps`.
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` is required on Sobo; without it, white screen.
- `preserveDrawingBuffer:true` made gameplay sluggish and should not be kept.
- render scale experiments did not get to 60fps.

### Luakit + gamescope-korri 720@120 pixel scaling

A nested Gamescope probe improves the low-memory WebKit path but does not reliably clear 60fps at 720-ish canvas size.

Prototype files on Sobo:

- `/tmp/yfs-gamescope-korri-luakit-prototype.sh`
- `/tmp/yfs-gamescope-korri-luakit.log`
- `/tmp/yfs-gamescope-korri-luakit.stats`

Gamescope package:

```text
/nix/store/haifc5g7yksqla9pci5kzcl12wxi61mj-gamescope-korri-3.16.17-korri/bin/gamescope
gamescope version 3.16.17-korri
```

Launch shape:

```bash
gamescope-korri \
  --backend wayland \
  -f -b \
  -W 1920 -H 1080 \
  -w 1280 -h 720 \
  -r 120 \
  -S integer \
  -F pixel \
  --force-windows-fullscreen \
  --stats-path /tmp/yfs-gamescope-korri-luakit.stats \
  -- luakit -U 'yfs://app/index.html?sample=basicMovement&metrics=1'
```

Client mode matters:

- Wayland client mode left Luakit at its default-ish `800x431` canvas, with later metrics around `56–58fps`.
- Xwayland client mode let `--force-windows-fullscreen` resize the canvas to `1280x689`, with later metrics around `55–58.8fps`.

Measured Xwayland / pixel-scaling results:

```text
720-ish: fps 55.0 avg 18.2ms canvas 1280x689
720-ish: fps 58.5 avg 17.1ms canvas 1280x689
720-ish: fps 58.8 avg 17.0ms canvas 1280x689
360-ish: fps 60.1–61.4 avg 16.3–16.6ms canvas 640x345
```

YFS project config in `data.json` reports a base viewport of `832x448` (`project[10]`, `project[11]`) with `nearest` sampling and `vsync` frame scheduling. The measured canvas sizes preserve that aspect ratio while subtracting a small amount of vertical browser/client chrome (`640x345`, `1280x689`).

The 360p probe appears capped near 60fps even though the physical output is 120Hz and Gamescope was launched with `-r 120`. The signals are:

- metrics cluster around `fps 60–61` and `avgFrameMs 16.3–16.6ms`
- project config has frame scheduling set to `"vsync"`
- Chromium/CEF on the same device reports ~120fps, so the cap is likely WebKitGTK/Xwayland/Gamescope rAF presentation behavior rather than the YFS metrics harness

Hardware path evidence:

```text
gamescope version 3.16.17-korri
Xwayland on :1
[C3 runtime] Hosted in DOM, rendering with WebGL 2 [Apple GPU]
```

Notes:

- No software GL fallback was forced; `LIBGL_ALWAYS_SOFTWARE` is unset.
- YFS itself has no meaningful video decode workload in this path; the relevant gate is hardware WebGL. Logs report `Apple GPU`, not `llvmpipe`/software.
- The Gamescope path reduces compositor overhead and lets us pixel-scale a smaller WebKit canvas, but the WebKit web process still saturates CPU/GPU and remains just below stable 60fps.

### Electrobun native WebKit

Native Electrobun WebKit is not currently a viable YFS runtime.

Findings:

- Swapping Korri's Electrobun `mainview` to YFS starts the enclosure.
- YFS reports missing WebGL in native WebKit.
- With `WEBKIT_DISABLE_DMABUF_RENDERER=1`, the prototype crashed with signal 6.
- Without the workaround, WebKit shows EGL/GBM failures similar to prior Korri WebKit issues.

Observed errors:

```text
Failed to create GBM device for render device: /dev/dri/renderD128: No such file or directory
Cannot get default EGL display: EGL_BAD_PARAMETER
```

Conclusion: native WebKit may require patching Electrobun's native wrapper WebKit settings, but even then the WebKit path is unlikely to be the 60fps path on this device.

### Standalone Chromium/Wayland

Standalone Chromium proves the game can hit 60fps+.

Prototype:

- `/tmp/yfs-chromium-prototype.sh`
- `/tmp/yfs-chromium.log`

Launch shape:

```bash
chromium \
  --no-sandbox \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  --kiosk \
  --app="file:///tmp/YFSv3.13.1/www/index.html?sample=basicMovement&metrics=1" \
  --allow-file-access-from-files \
  --autoplay-policy=no-user-gesture-required \
  --ignore-gpu-blocklist
```

Performance:

```text
YFS fps 122.1 avg 8.2 worst 8.4
```

Memory:

```text
Chromium PSS: ~841 MB
```

### Electrobun CEF

Electrobun can run YFS at 60fps+ via CEF, not native WebKit.

Prototype files on Sobo:

- `/root/yfs-electrobun-cef/Korri-dev`
- `/tmp/yfs-electrobun-cef-prototype.sh`
- `/tmp/yfs-electrobun-cef.log`

Setup required:

- Download Electrobun `v1.16.0` arm64 core + CEF runtime.
- Replace bundle native wrapper with `libNativeWrapper_cef.so`.
- Add CEF runtime under `bin/cef` and symlink CEF shared libs into `bin`.
- Switch `Resources/build.json` to CEF:

```json
{
  "defaultRenderer": "cef",
  "availableRenderers": ["native", "cef"],
  "runtime": {},
  "bunVersion": "1.3.9"
}
```

- Include CEF runtime library dependencies in `LD_LIBRARY_PATH`.
- Include old-compatible GL stack:

```bash
LD_LIBRARY_PATH=.../libglvnd-1.7.0/lib:.../mesa-25.2.6/lib:$LD_LIBRARY_PATH
LIBGL_DRIVERS_PATH=.../mesa-25.2.6/lib/dri
__EGL_VENDOR_LIBRARY_DIRS=.../mesa-25.2.6/share/glvnd/egl_vendor.d
```

- Remove Electrobun's default GPU-disabling Chromium flags and enable WebGL/GPU:

```json
"chromiumFlags": {
  "disable-gpu": false,
  "disable-gpu-compositing": false,
  "disable-accelerated-2d-canvas": false,
  "disable-accelerated-video-decode": false,
  "disable-accelerated-video-encode": false,
  "disable-gpu-memory-buffer-video-frames": false,
  "use-gl": false,
  "ignore-gpu-blocklist": true,
  "enable-webgl": true
}
```

Performance after GL stack fix:

```text
fps 124.2 avg 8.1 worst 17.6
fps 126.4 avg 7.9 worst 12.9
fps 127.9 avg 7.8 worst 12.1
canvas 1920x1034 css 1920x1034 scale 1
longFrames 0 after warmup
```

Memory:

```text
Electrobun CEF PSS: ~1131 MB
```

Important failed intermediate states:

- CEF without GPU flags: metrics looked like 120fps but `canvas no`; the game had not reached a real WebGL canvas.
- `use-gl=egl` was wrong for this CEF build:

```text
Requested GL implementation (gl=egl-gles2,angle=none) not found in allowed implementations: [(gl=egl-angle,angle=default)]
```

- Missing `libGL.so.1` caused repeated GPU process failures.
- Adding old-compatible `libglvnd` + Mesa driver paths fixed real canvas/WebGL performance.

## Scoped input mapping

Controller mapping uses a scoped `evsieve` sidecar. It exists only while the launcher wrapper is alive.

Bindings:

- D-pad + left stick → arrow keys
- gamepad west/X → keyboard `z`
- gamepad south/A → keyboard `a`
- gamepad east/B → keyboard `x`
- gamepad start → keyboard `p`

This avoids global InputPlumber profile leakage.

## Metrics harness

A lightweight `yfs-metrics.js` overlay reports:

- fps
- average frame ms
- worst frame ms
- `>34ms` frame count
- canvas presence and size

For Electrobun, metrics also POST to:

```text
/__korri/desktop/trace
```

so the Bun-side log captures renderer metrics as `renderer-trace` entries.

## Current decision snapshot

- If **no-server + low memory** is the top priority: Luakit custom `yfs://` scheme is the cleanest current path, but only ~40fps.
- If **60fps+ is non-negotiable**: Chromium or Electrobun CEF are the proven paths.
- If **we want to reuse the Korri/Electrobun enclosure**: use Electrobun CEF, not native WebKit.
- Electrobun CEF currently has the highest memory use, but it proves the “already open enclosure” concept at >120fps.

## Open questions / next steps

1. Productize Electrobun CEF packaging in Korri's Nix desktop package.
2. Reduce Electrobun CEF memory overhead.
3. Decide whether YFS should launch as:
   - standalone Chromium app,
   - Electrobun CEF route/window,
   - or Luakit `yfs://` for low-memory mode.
4. Replace DOM direct-launch automation with a proper Construct/runtime patch.
5. Package YFS under `product/vendor/yoshis-fabrication-station/` with checks.
6. Keep scoped input wrapper as session-owned sidecar; do not use global InputPlumber profile switching.

---

## Productized Chromium/web-canvas launcher update (2026-06-21)

Current product direction is a first-class YFS launcher over the private
`@korri:web-canvas` Chromium path:

```bash
yfs-launch <raw-yfs-level-json>
```

Decisions captured by implementation:

- `KORRI_YFS_WEBROOT` must point to an already-compatible/patched YFS webroot.
  Raw upstream extract support is intentionally out of scope for the launcher;
  extraction/package owns source compatibility patches.
- The supplied level is copied into a prepared root as `level.json` and launched
  through `index.html?code_url=level.json`.
- Prepared roots are cache/store-like artifacts keyed by webroot identity, level
  digest, launcher version, and settings. They are not deleted on process exit.
- Prepared roots may normalize the copied `scripts/main.js` export marker to
  `exportType:"html5"`, but they do not mutate `KORRI_YFS_WEBROOT`.
- Prepared roots remove legacy `direct-launch-pre.js`/`direct-launch.js` script
  tags so the new web-canvas pre-navigation shim bundle is the only automation
  path for `yfs-launch`.
- The new `yfs-launch-settings.js` helper does not set
  `preserveDrawingBuffer`; keeping the Chromium/WebGL 120fps-class path is more
  important than boot-frame capture.
- The loader remains DOM-automation based for this slice and reports host-visible
  state through `window.__YFS_DIRECT_LAUNCH`. Direct Construct gameplay jumping
  remains a follow-up.
- `--allow-file-access-from-files` is private to the YFS local-file launcher and
  must not become a generic web-canvas default.

Latest manual Sobo proof before productization used a real Level Share Square
YFS level:

- Provider/API: Level Share Square, `game=1`.
- Level id: `6a36fec33e11434283a577f1`.
- Title: `Another Yoshi's Island 2-6: Sewer You Next Summer`.
- Raw payload size: `111145` characters.
- Browser URL shape: `file:///tmp/yfs-webcanvas-stage/yfs/www/index.html?code_url=lss-level.json&metrics=1`.
- Loader state reached `ready` after three attempts.
- WebGL renderer readback: ANGLE/Freedreno on FD740, not SwiftShader/llvmpipe.
- rAF sample: approximately `121.98fps`, average `8.20ms`, worst `8.30ms`.

Post-productization completion requires repeating this proof through the public
`yfs-launch <level-file>` command rather than manual staging/CDP.
