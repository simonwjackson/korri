---
title: Korri product systems and images
date: 2026-05-21
---

# Korri product systems and images

Korri exposes reusable product-system composition helpers at `lib.<system>.korriImages`:

- `mkHeadlessSystem { platformModules ? [ ]; modules ? [ ]; }`
- `mkKioskSystem { platformModules ? [ ]; modules ? [ ]; }`

The helpers compose Korri product modules with explicit platform adapter modules. They do not import Snapdragon, RockNix, or personal deployment facts.

Baseline x86 system outputs are exposed as package attrs:

```bash
nix build .#korri-headless-system
nix build .#korri-kiosk-system
```

These are evaluated NixOS system closures, not a full OTA/update product. Manual installation, partitioning, flashing, rollback UX, and remote builder selection remain operator/platform concerns.

## Product splits

- Headless system: enables `services.korri.server` in system mode and does not enable `client`, `kiosk`, or appliance input services.
- Kiosk system: enables `services.korri.kiosk`, `services.korri.client`, `services.korri.inputd`, and a local loopback `services.korri.server` with conservative firewall defaults.

## Platform adapter seam

External platforms supply modules through `platformModules`. A platform module can declare normalized input, add service ordering, provide Sway fragments, and configure hardware substrate without changing generic Korri modules:

```nix
inputs.korri.lib.${system}.korriImages.mkKioskSystem {
  platformModules = [
    ./platform/hardware-quirks.nix
    ({ ... }: {
      services.korri.kiosk.input.provider = {
        enable = true;
        name = "platform-input";
        services = [ "platform-input.service" ];
      };
    })
  ];
}
```

Requesting a kiosk product system with appliance input required but without a provider or explicit opt-out fails evaluation with a Korri assertion. That makes missing platform input an integration error instead of a boot-time surprise.
