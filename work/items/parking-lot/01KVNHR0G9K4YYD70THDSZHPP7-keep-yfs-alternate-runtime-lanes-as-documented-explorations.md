---
id: 01KVNHR0G9K4YYD70THDSZHPP7
slug: keep-yfs-alternate-runtime-lanes-as-documented-explorations
title: Keep YFS alternate runtime lanes as documented explorations
origin: parked
status: To Do
priority: low
labels:
  - yfs
  - runtime-exploration
  - chromium
  - webkit
  - cef
created: 2026-06-21
source: user
---

# Keep YFS alternate runtime lanes as documented explorations

## Why it matters

Chromium/web-canvas is now the default because it reaches hardware WebGL and ~122fps on Sobo, but prior work found potentially useful alternate lanes: Luakit/WebKit for lower memory, Electrobun CEF for Korri enclosure reuse, and gamescope-korri for viewport-scaling experiments. These should remain as future explorations, not block the productized launcher.

## Acceptance Criteria

- [ ] Document Chromium/web-canvas as the default YFS runtime with the Sobo evidence: hardware WebGL, 1920x1034 canvas, ~122fps rAF, no preserveDrawingBuffer
- [ ] Preserve Luakit/WebKit notes as a low-memory exploration with known constraints: WebKit CORS/custom scheme, WEBKIT_DISABLE_DMABUF_RENDERER, ~40-60fps caps
- [ ] Preserve Electrobun CEF notes as an enclosure-reuse exploration with known constraints: CEF packaging, GL library paths, higher memory
- [ ] Retire or mark obsolete old gamescope-first requirements that conflict with the no-gamescope web-canvas default, while keeping gamescope-korri as an optional future experiment
- [ ] Add a future comparison checklist: memory PSS, fps/rAF, WebGL renderer, input lifecycle, and launch complexity

## Related

- `work/parking-lot/01KTPAJV8CXDNXKVHST6S87NQ0-productize-high-performance-chromium-cef-web-launcher-with-gamescope-kor.md`
- `work/parking-lot/01KTPAJV8BW687JWRCKJFXGQ13-productize-no-server-webkit-luakit-web-launcher-with-yfs-scheme-and-game.md`
- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md`

## Notes

Consolidates older Chromium+gamescope/CEF and Luakit/WebKit parking-lot items under an exploration umbrella so they do not confuse the immediate YFS launcher productization path.
