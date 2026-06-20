---
module: product/plugins
tags:
  - fex
  - proton
  - steam
  - plugin-boundary
problem_type: architecture
---

# FEX substrate and Steam runtime boundary

Korri treats FEX and Proton as reusable runtime substrates, even when the current Bandai deployment still provisions their default files under Steam state.

## Ownership split

- `@korri:fex` owns generic FEX substrate facts such as the default rootfs path and Vulkan ICD contract.
- `@korri:proton` owns Proton runtime defaults such as the Proton 10 root, Wine DLL overrides, and GL driver path.
- `@korri:steam` owns Steam-specific behavior: Steam AppID launch, install authority, service envelope, Steam Runtime/pressure-vessel repair, Proton patching for Steam launches, visibility policy, and AppID cleanup.

This means generic FEX/Proton consumers import path facts from `@korri:fex` or `@korri:proton`, not from Steam. Shell launchers should delegate defaults to `korri-fex-runtime` and `korri-proton-runtime` setup helpers rather than duplicating Steam path literals.

## Current deployment caveat

The default Bandai paths intentionally remain unchanged:

- FEX rootfs: `/var/lib/korri/steam/fex-rootfs`
- Proton 10 root: `/var/lib/korri/steam/steamapps/common/Proton 10.0`

Those locations are still physically provisioned by the Steam/NixOS runtime wiring today. The source-of-truth split moves code ownership only; it does not make FEX provisioning Steam-independent yet.

## What stays Steam-owned

Do not move `steam-guest-runtime-prep`, pressure-vessel wrapper repair, `srt-bwrap` handling, Steam AppID launch, or Steam foreground cleanup into `@korri:fex`. Those contracts are consequences of Steam's mutable runtime and are documented separately in `docs/solutions/runtime-errors/steam-sniper-fex-bwrap-architecture-path-2026-06-19.md`.

The Steam AppID UX policy remains Steam-owned as documented in `docs/solutions/architecture-patterns/steam-appid-launch-ux-policy-2026-06-20.md`.
