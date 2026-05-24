---
title: Korri product systems and images
date: 2026-05-21
---

# Korri product systems and images

Korri exposes reusable product-system composition helpers at `lib.<system>.korriImages`:

- `mkHeadlessSystem { platformModules ? [ ]; modules ? [ ]; }`
- `mkKioskSystem { platformModules ? [ ]; modules ? [ ]; }`
- `mkLiveUsbKioskSystem { platformModules ? [ ]; modules ? [ ]; }`

The helpers compose Korri product modules with explicit platform adapter modules. Generic helpers do not import Snapdragon, RockNix, or personal deployment facts. RockNix facts live in the RockNix platform adapter boundary, where Korri imports nix-on-rocks as the SM8550 substrate.

Baseline x86 system outputs are exposed as package attrs:

```bash
nix build .#korri-headless-system
nix build .#korri-kiosk-system
nix build .#korri-kiosk-live-iso
```

`korri-kiosk-live-iso` is a bootable live USB/ISO appliance artifact. It is intended to be written to removable media and boot directly into the Korri kiosk surface; it is not an installer and does not represent an internal-disk deployment target. The image uses the `korri-desktop-x86-kiosk` wrapper, which enables the Electrobun inputd bridge and puts `moonlight-embedded` on the appliance PATH instead of Moonlight Qt.

The live USB kiosk routes Korri client state under `/persist/korri-live-usb/home`. At boot, `korri-live-usb-persistence.service` resolves the mounted live ISO device, derives its parent USB block device, and mounts only a sibling partition labeled `KORRI-PERSIST`. If no matching same-stick partition exists, it uses an ephemeral tmpfs state root and writes `.korri-live-usb-ephemeral`; it does not search internal disks by generic label. Persisted client state includes Korri XDG config/data/state and moonlight-embedded pairing/cache state under `home/.cache/moonlight`.

Discovery is unchanged from the standard Electrobun/Korri app path: the live image permits mDNS client browsing on UDP 5353, then uses the existing remembered-first/first-healthy connection controller. There is no USB-specific server discovery and no aka-specific priority or fallback.

Remote launch keeps the standard prepare-before-stream sequence after a local input preflight. The desktop launch bridge first verifies the appliance has a normalized InputPlumber virtual gamepad, then calls the connected server's control URL to prepare the selected known game, then launches Moonlight against the reachable host from that same control URL. On the live kiosk, `KORRI_MOONLIGHT_COMMAND` points at the packaged `moonlight-embedded` binary, so the appliance path does not depend on Moonlight Qt or a runtime `nix run` fallback. Moonlight is launched with one explicit InputPlumber virtual input device and the packaged generic `gamecontrollerdb.txt`; stream success without that input route is not considered a valid appliance pass.

### x86 live USB validation tiers

Build or dry-build the artifact from an x86_64 Linux machine:

```bash
nix build .#packages.x86_64-linux.korri-kiosk-live-iso --dry-run --no-link
nix build .#packages.x86_64-linux.korri-kiosk-live-iso
```

Flake-native checks cover unattended validation:

```bash
nix build .#checks.x86_64-linux.korri-live-usb-config --no-link
nix build .#checks.x86_64-linux.korri-live-usb-vm-smoke --no-link
```

- `korri-live-usb-config` is the cheap default configuration check. It proves the live USB NixOS composition still has the expected ISO flags, persistence ordering, state roots, and disk-mutation safeguards.
- `korri-live-usb-vm-smoke` boots a bounded NixOS VM from the live USB runtime composition. It proves persistence fallback, inputd, and kiosk orchestration in a VM; it does not prove ISO firmware boot, USB media behavior, graphics quality, or physical NUC acceptance.

Manual validation is exposed through flake apps:

```bash
nix run .#korri-live-usb-vm
nix run .#korri-live-usb-qemu
nix run .#korri-live-usb-qemu-persistence
```

- `korri-live-usb-vm` runs the NixOS runtime VM directly through `config.system.build.vm` for interactive system validation.
- `korri-live-usb-qemu` boots the built ISO under QEMU/OVMF for manual firmware-path validation and writes evidence under `out/live-usb-smoke/`.
- `korri-live-usb-qemu-persistence` copies the hybrid ISO to one writable USB disk image, appends a sibling `KORRI-PERSIST` partition, and boots that single image as QEMU USB storage. It is useful for manual resolver inspection, but it does not replace physical NUC acceptance.
- Set `KORRI_QEMU_PREP_ONLY=1` with either QEMU app to prepare evidence/images without launching QEMU.

Write the resulting ISO to removable USB media with the operator's preferred imaging tool, then create a second partition on the same USB device labeled `KORRI-PERSIST` for persistent client state. Do not create or select a persistence partition on the NUC internal disk.

Physical v1 acceptance targets an 8th-gen Intel NUC with Ethernet, keyboard fallback, and an XInput-compatible wired USB controller. QEMU validation increases confidence, but it does not replace physical NUC acceptance. Before boot, record the internal disk identity or a sentinel hash. After booting from USB, verify:

- the TV reaches the Korri kiosk surface without an installer workflow;
- the internal disk sentinel is unchanged;
- `/persist/korri-live-usb` is either the same-stick `KORRI-PERSIST` partition or an ephemeral tmpfs marked `.korri-live-usb-ephemeral`;
- standard discovery sees compatible Korri servers on the wired LAN without host-name special cases;
- settings and moonlight-embedded pairing/cache state survive a reboot when same-stick persistence is present;
- InputPlumber is active, sees its package data root, and exposes exactly one expected virtual Xbox-class gamepad for the connected controller;
- inputd and Moonlight both consume the InputPlumber virtual gamepad, not the raw physical controller;
- selecting a remote game prepares the known game on the connected server and attempts a local `moonlight-embedded` stream with an explicit virtual input device.

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

### Normalized controller validation

All kiosk appliance targets use InputPlumber as the controller-normalization boundary. Physical controller quirks belong in the platform/InputPlumber package layer; Korri shell input and Moonlight launch code consume the resulting virtual Xbox-class event device.

A target is go only when device-side evidence shows:

- `inputplumber.service` is active and loaded the data root containing `share/inputplumber`;
- exactly one expected InputPlumber virtual Xbox-class gamepad exists for single-controller validation;
- raw physical gamepads may be visible for diagnostics but are ignored by inputd and are not passed to Moonlight;
- Moonlight launches with one explicit virtual input device and the generic mapping DB;
- restarting InputPlumber or unplugging/replugging the controller does not leave stale event-node state.

Stop rollout for that target if InputPlumber is active with zero virtual targets, multiple virtual targets appear in single-controller mode, Moonlight launches without explicit virtual input, or controls work only through raw evdev. Rollback should use the previous known-good image/generation and should verify both kiosk navigation and Moonlight stream input before expanding again.

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
