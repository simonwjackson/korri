---
id: 01KXBP21Q6DV32B40QYNN0TN4G
slug: improve-pico-8-cart-compatibility-beyond-fake08-limits
title: Improve PICO-8 cart compatibility beyond fake08 limits
origin: parked
status: To Do
priority: medium
labels:
  - pico8
  - bandai
  - emulation
  - store
created: 2026-07-12
source: se-debug
---

# Improve PICO-8 cart compatibility beyond fake08 limits

## Why it matters

Store-acquired PICO-8 carts launch through @korri:pico8/fake08 (a reimplementation with incomplete PICO-8 API coverage). Verified differential on Bandai: Celeste (cart 15133) renders fine while Dinky Kong (dinkykong-0.p8.png, a valid 160x205 cart) shows a black screen under the identical gamescope->retroarch->fake08 stack. Modern carts using newer PICO-8 APIs (tline, custom fonts, extended memory pokes) silently black-screen, making the Store->Play promise unreliable for a large share of BBS content.

## Acceptance Criteria

- [ ] Dinky Kong (BBS cart) renders and plays on Bandai
- [ ] Chosen approach documented: official Lexaloffle PICO-8 arm64 runtime as a launcher, upstream fake08 fixes, or per-cart compatibility gating
- [ ] Known-incompatible carts fail with a user-visible message instead of a silent black screen

## Related

- `product/plugins/pico8/src/plugin.ts`

## Notes

Lexaloffle ships an official PICO-8 Raspberry Pi/arm64 binary that runs BBS carts natively; it is proprietary (paid license) so it would follow the local-plugin/operator-installed path rather than bundling. fake08 black screen = cart uses unsupported API; no error surfaces through retroarch.
