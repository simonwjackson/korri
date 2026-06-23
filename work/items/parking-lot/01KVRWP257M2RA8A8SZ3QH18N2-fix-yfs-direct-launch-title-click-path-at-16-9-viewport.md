---
id: 01KVRWP257M2RA8A8SZ3QH18N2
slug: fix-yfs-direct-launch-title-click-path-at-16-9-viewport
title: "Fix YFS direct launch title-click path at 16:9 viewport"
origin: parked
status: To Do
priority: high
labels:
  - yfs
  - sm8550
  - bug
created: 2026-06-23
source: user
---

# Fix YFS direct launch title-click path at 16:9 viewport

## Why it matters

After switching Sobo YFS to 16:9 with no explicit zoom, the packaged page no longer contains the literal escape text artifact, but direct launch still times out opening the Play Level UI and returns to home. This blocks using 16:9/no-zoom as the platform default.

## Acceptance Criteria

- [ ] Launching yfs-sewer-you-next-summer on Sobo with --viewport-aspect=16:9 and no --zoom reaches gameplay and stays in sessiond game mode.
- [ ] A screenshot during the active session shows YFS/gameplay rather than the portal or a black startup frame.
- [ ] Prepared root index.html contains no literal `\\n` or `\\t` text around injected direct-launch scripts.
- [ ] Regression coverage exercises the 16:9/no-zoom launcher configuration or its click/direct transition seam.

## Related

- `product/plugins/yoshis-fabrication-station/scripts/direct-launch.js`
- `product/plugins/yoshis-fabrication-station/package.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`

## Notes

Observed failure tail: `yfs-launch failed ... Timed out opening the YFS Play Level UI`. Artifact fix deployed in package HTML injection; remaining failure appears to be title-screen Play Level transition at 16:9/no-zoom.
