---
id: 01KVNHNGEAY8F6KZN4F0G6HV6F
slug: productize-yfs-launcher-over-web-canvas-for-supplied-level-a
title: Productize YFS launcher over web-canvas for supplied level artifacts
origin: parked
status: To Do
priority: high
labels:
  - yfs
  - launcher
  - web-canvas
  - sobo
created: 2026-06-21
source: user
---

# Productize YFS launcher over web-canvas for supplied level artifacts

## Why it matters

We proved on Sobo that YFS can run at ~122fps through the web-canvas substrate and launch a real Level Share Square level when given a raw YFS level JSON artifact. This needs to become a first-class YFS launcher surface so users never author against @korri:web-canvas/chromium directly.

## Acceptance Criteria

- [ ] Add a YFS launcher command shaped like `yfs-launch <level-file>` with `KORRI_YFS_WEBROOT` supplied by the extraction/runtime environment
- [ ] Launcher creates a prepared launch root from the provided webroot, copies the supplied raw level JSON as `level.json`, and opens `index.html?code_url=level.json`
- [ ] Launcher applies a guarded prepared-copy-only patch from `exportType:"windows-webview2"` to `exportType:"html5"`, accepts already-html5 payloads, and fails clearly for unknown export markers
- [ ] Launcher composes @korri:web-canvas privately, passes `--allow-file-access-from-files`, disables generic gate, and supplies internal ordered YFS shim bundle
- [ ] YFS plugin descriptor exposes a YFS launcher with YFS-specific settings, not the generic web-canvas launcher
- [ ] On Sobo, launching the same acquired raw YFS level artifact reaches gameplay and confirms hardware WebGL + ~120fps-class rAF cadence

## Related

- `product/plugins/yoshis-fabrication-station/index.ts`
- `product/plugins/yoshis-fabrication-station/scripts/direct-launch.js`
- `product/plugins/web-canvas/src/runtime/korri-web-canvas.ts`
- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

## Notes

Consolidates the current proven path: webroot from extraction, raw level artifact path as release/content input, prepared webroot copy, relative code_url, WebView2→html5 guarded patch, no preserveDrawingBuffer.
