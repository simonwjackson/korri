---
id: 01KVG72JQPD5FK4YSFT6S4P53F
slug: move-remaining-product-owned-rocknix-guest-surfaces-into-kor
title: Move remaining product-owned ROCKNIX guest surfaces into Korri
origin: parked
status: To Do
priority: medium
labels:
  - rocknix
  - korri
  - ownership
  - sobo
created: 2026-06-19
source: user
context:
  branch: ci/fresh-sobo-nix-on-rocks
  repo: korri
---

# Move remaining product-owned ROCKNIX guest surfaces into Korri

## Why it matters

Korri should own appliance identity, branding, launch UX, and app/runtime policy so nix-on-rocks can remain a product-neutral substrate. Leaving product policy in nix-on-rocks makes future Sobo installs depend on substrate-side Korri assumptions and increases drift risk.

## Acceptance Criteria

- [ ] nix-on-rocks no longer exposes Korri/product device profiles as product-facing modules; Korri imports only neutral substrate modules
- [ ] Cemu and Moonlight package/module/launcher ownership is migrated or explicitly tracked as the only remaining exception
- [ ] fallback main-space launch/chord UX is either removed from the product path or reduced to substrate-only diagnostics
- [ ] Korri owns boot-splash branding payload definitions and product lock promotion docs
- [ ] Checks assert Korri product configs do not consume nix-on-rocks product-profile modules

## Related

- `product/systems/nixos/devices/rocknix/`
- `product/systems/nixos/flake/products.nix`
- `product/systems/rocknix/branding/rocknix-splash-boot-logo.patch`
- `../nix-on-rocks/guest/profiles/`
- `../nix-on-rocks/guest/launchers/`
- `../nix-on-rocks/packages/`
