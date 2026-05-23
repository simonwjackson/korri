---
title: Korri product systems and images
date: 2026-05-21
---

# Korri product systems and images

Korri exposes reusable product-system composition helpers at `lib.<system>.korriImages`:

- `mkHeadlessSystem { platformModules ? [ ]; modules ? [ ]; }`
- `mkKioskSystem { platformModules ? [ ]; modules ? [ ]; }`

The helpers compose Korri product modules with explicit platform adapter modules. Generic helpers do not import Snapdragon, RockNix, or personal deployment facts. RockNix facts live in the RockNix platform adapter boundary, where Korri imports nix-on-rocks as the SM8550 substrate.

Baseline x86 system outputs are exposed as package attrs:

```bash
nix build .#korri-headless-system
nix build .#korri-kiosk-system
```

RockNix-backed kiosk appliances are exposed as explicit device targets:

```bash
nix build .#packages.aarch64-linux.korri-rocknix-kiosk-system-thor
nix build .#packages.aarch64-linux.korri-rocknix-kiosk-system-odin2portal
nix build .#korri-rocknix-rootfs-thor
nix build .#korri-rocknix-rootfs-odin2portal
```

Matching NixOS configurations are available as:

- `nixosConfigurations.korri-rocknix-kiosk-thor`
- `nixosConfigurations.korri-rocknix-kiosk-odin2portal`
- `nixosConfigurations.korri-rocknix-kiosk-by-compatible`

Thor and Sobo/Odin 2 Portal are kiosk appliances only. They include the Korri server, Electrobun client, Sway kiosk, and inputd; they are not server-only RockNix targets. The by-compatible configuration is an impure on-device convenience that reads the normalized device-compatible value through nix-on-rocks. Use the explicit per-device targets for off-device review and Fuji/aarch64 build gates.

These are evaluated NixOS system closures or rootfs tarball packages, not a full OTA/update product. Manual installation, partitioning, flashing, rollback UX, and remote builder selection remain operator/platform concerns.

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

## RockNix SM8550 platform adapter

Korri imports nix-on-rocks for the product-blind substrate contract:

- `nixosModules.rocknix-guest-base`
- explicit Thor and Odin 2 Portal device profiles
- by-compatible device-profile selection for on-device promotion
- substrate package outputs such as Cemu, Steam, moonlight-embedded, InputPlumber, and UCM
- the rootfs packaging helper used by `korri-rocknix-rootfs-*`

The RockNix appliance composition keeps the server as a non-root system service (`korri-server`) while the constrained guest kiosk session runs as root with the existing `/run/user/0/bus` session bus supplied by nix-on-rocks. Korri selects user-launchable app packages from the substrate; nix-on-rocks keeps SM8550 launchers and OS-coupled runtime plumbing.
