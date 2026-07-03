---
title: Extract Moonlight streaming into a first-party plugin
status: active
created: 2026-07-03
source: se-plan
branch: refactor/moonlight-plugin
---

# Extract Moonlight streaming into a first-party plugin

Move Korri's Moonlight streaming integration out of the platform engine and into
`product/plugins/moonlight`, mirroring the gamescope/steam/retroarch first-party
plugin pattern. Moonlight is the same class of thing as those (a specific
third-party tool the engine drives) but predates the plugin discipline, so it is
woven into three shared contracts: the `stream/` platform folder, the library
config schema, and the stream-control contract, plus the Nix system images.

Design decisions locked with the user:
- Land as one branch (`refactor/moonlight-plugin`), internally sequenced.
- Breaking config migration off first-class `moonlight.*` fields.
- Move the vendored Nix package into the plugin's `packages/`.
- Relocate the generic foreground-session engine to `@platform/session`.
- Seam shape B: generic dispatch operations, Moonlight-shaped payloads.
