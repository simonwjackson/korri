---
id: 01KWN2KEGT3NGTJZ6SHDRJ3YEG
slug: coerce-runtime-bitrate-fps-instead-of-rejecting-via-patch-ex
title: Coerce runtime bitrate/FPS instead of rejecting (via patch-export workflow)
origin: parked
status: To Do
priority: low
labels:
  - runtime-settings
  - moonlight
  - accept-and-adapt
  - patch-workflow
  - task-092
created: 2026-07-03
source: se-work
---

# Coerce runtime bitrate/FPS instead of rejecting (via patch-export workflow)

## Why it matters

Resolution already coerces (clamp + round-to-even) instead of rejecting, per accept-and-adapt. Bitrate and FPS still return "out of bounds" errors for out-of-range values. The fix is trivial (clamp to advertised min/max) but the reject lines in patch 0007 are referenced as context by patch 0008, so a hand-edit desyncs the stacked patches. This must be done through the moonlight-embedded-korri patch dev-checkout/export workflow that regenerates the whole stack consistently. Low user impact (bounds only trip on absurd values) but needed for a uniform accept-and-adapt contract.

## Acceptance Criteria

- [ ] Bitrate and FPS set-commands clamp to the advertised encoder-safe min/max instead of returning invalid/out-of-bounds.
- [ ] Patch stack 0007+0008 applies cleanly and moonlight-embedded-korri builds (nix build .#checks.x86_64-linux.korri-moonlight-control-protocol-patch).
- [ ] Nix invariant asserts the bitrate/fps out-of-bounds reject strings are gone.
- [ ] README documents bitrate/FPS coercion.

## Related

- `product/vendor/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch`
- `product/vendor/moonlight-embedded-korri/patches/0008-add-runtime-set-resolution-on-local-control.patch`
- `docs/acceptance/runtime-settings-protocol-contract.md`
