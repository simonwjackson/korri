---
id: 01KVNHNSSMTDWET3S31P0YNPAX
slug: teach-web-canvas-to-live-evaluate-ordered-app-shims
title: Teach web-canvas to live-evaluate ordered app shims
origin: parked
status: To Do
priority: high
labels:
  - web-canvas
  - yfs
  - launcher
  - shim
created: 2026-06-21
source: user
---

# Teach web-canvas to live-evaluate ordered app shims

## Why it matters

The YFS proof exposed that app shims registered only for future documents can miss the already-loaded game document, while the presentation shim works because it is reasserted on the live page during startup. A generic live-shim mechanism keeps YFS from owning one-off CDP plumbing and benefits future canvas games needing app-specific bootstrap code.

## Acceptance Criteria

- [ ] `settings.plugin.shim` sources are registered for future documents and also evaluated on the live document during the startup window
- [ ] Shims run in the order provided by the composing launcher; users do not specify YFS ordering directly
- [ ] Repeated live evaluation is safe: missing files fail clearly or are explicitly optional by contract, and successful shims do not multiply uncontrolled timers/listeners
- [ ] YFS can supply its internal ordered bundle: settings helper first, level-loader helper second
- [ ] Unit tests cover ordered shim loading and live evaluation behavior without exposing implementation details in the user-facing launcher

## Related

- `product/plugins/web-canvas/src/canvas.ts`
- `product/plugins/web-canvas/src/settings.ts`
- `product/plugins/yoshis-fabrication-station/scripts/direct-launch.js`

## Notes

Discovered during Sobo proof: direct-launch.js had to be live-evaluated manually because the current shim handling only added scripts for future documents.
