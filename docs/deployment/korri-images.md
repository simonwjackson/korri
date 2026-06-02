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

Launch YAML uses the app/module model documented in [Korri launch config apps and modules](./korri-launch-config.md). Product images provide only the app binaries and module paths they explicitly enable; YAML selection does not add emulator packages to an image.

Baseline x86 system outputs are exposed as package attrs:

```bash
nix build .#korri-headless-system
nix build .#korri-kiosk-system
nix build .#korri-kiosk-live-iso
nix build .#korri-kiosk-live-developer-iso
```

`korri-kiosk-live-iso` is the Product ISO: the canonical bootable live USB/ISO appliance artifact. It is intended to be written to removable media and boot directly into the Korri kiosk surface; it is not an installer and does not represent an internal-disk deployment target. The image uses the `korri-desktop-x86-kiosk` wrapper, which enables the Electrobun inputd bridge and puts `moonlight-embedded` on the appliance PATH instead of Moonlight Qt.

`korri-kiosk-live-developer-iso` is the Developer ISO. It is a separate artifact for investigation and intentionally carries broad Developer persistence under its own namespace. It is not a boot-menu mode inside the Product ISO, and broad Developer persistence does not change the Product ISO allowlist.

At boot, `korri-live-usb-persistence.service` resolves the mounted live ISO device, derives its parent USB block device, and mounts only a sibling partition labeled `KORRI-PERSIST`. Neither Product ISO nor Developer ISO searches internal disks by generic label. Product ISO uses an ephemeral kiosk home and exposes only allowlisted persistent paths from `/persist/korri-live-usb/product`: Korri config including atomic `desktop.yaml` writes, selected Korri XDG data/state, moonlight-embedded pairing/cache state, and a Korri-owned live USB device identity. Network/input setup and bounded diagnostics are no-op Product allowlist categories in the current x86 image until an owning setup service/path exists. Product runtime/cache files outside that allowlist reset across boots. If no matching same-stick partition exists, Product ISO uses an ephemeral tmpfs state root and writes `.korri-live-usb-ephemeral`. Developer ISO requires retained same-stick persistence; missing or unsafe persistence fails visibly before normal kiosk use. Product setup locks an inactive Developer namespace before the kiosk starts so broad Developer state is not traversable from a later Product session.

Discovery is unchanged from the standard Electrobun/Korri app path: the live image permits mDNS client browsing on UDP 5353, then uses the existing remembered-first/first-healthy connection controller. There is no USB-specific server discovery and no aka-specific priority or fallback.

Remote launch keeps the standard prepare-before-stream sequence after a local input preflight. The desktop launch bridge first verifies the appliance has a normalized InputPlumber virtual gamepad, then calls the connected server's control URL to prepare the selected known game, then launches Moonlight against the reachable host from that same control URL. On the live kiosk, `KORRI_MOONLIGHT_COMMAND` points at the packaged `moonlight-embedded` binary, so the appliance path does not depend on Moonlight Qt or a runtime `nix run` fallback. Moonlight is launched with one explicit InputPlumber virtual input device and the packaged generic `gamecontrollerdb.txt`; stream success without that input route is not considered a valid appliance pass.

### x86 live USB validation tiers

Build or dry-build the artifact from an x86_64 Linux machine:

```bash
nix build .#packages.x86_64-linux.korri-kiosk-live-iso --dry-run --no-link
nix build .#packages.x86_64-linux.korri-kiosk-live-developer-iso --dry-run --no-link
nix build .#packages.x86_64-linux.korri-kiosk-live-iso
nix build .#packages.x86_64-linux.korri-kiosk-live-developer-iso
```

Flake-native checks cover unattended validation:

```bash
nix build .#checks.x86_64-linux.korri-live-usb-config --no-link
nix build .#checks.x86_64-linux.korri-live-usb-developer-config --no-link
nix build .#checks.x86_64-linux.korri-live-usb-vm-smoke --no-link
```

- `korri-live-usb-config` is the cheap Product ISO configuration check. It proves the live USB NixOS composition still has the expected ISO flags, allowlisted Product persistence, persistence ordering, state roots, and disk-mutation safeguards.
- `korri-live-usb-developer-config` is the cheap Developer ISO configuration check. It proves the separate Developer artifact uses the broad Developer persistence profile while retaining the same disk-mutation safeguards.
- `korri-live-usb-vm-smoke` boots a bounded NixOS VM from the live USB runtime composition. It proves persistence fallback, inputd, and kiosk orchestration in a VM; it does not prove ISO firmware boot, USB media behavior, graphics quality, or physical NUC acceptance.

Manual validation is exposed through flake apps:

```bash
nix run .#korri-live-usb-vm
nix run .#korri-live-usb-qemu
nix run .#korri-live-usb-qemu-persistence
nix run .#korri-live-usb-developer-qemu
nix run .#korri-live-usb-developer-qemu-persistence
```

- `korri-live-usb-vm` runs the NixOS runtime VM directly through `config.system.build.vm` for interactive system validation.
- `korri-live-usb-qemu` boots the built ISO under QEMU/OVMF for manual firmware-path validation and writes evidence under `out/live-usb-smoke/`.
- `korri-live-usb-qemu-persistence` copies the Product ISO to one writable USB disk image, appends a sibling `KORRI-PERSIST` partition, and boots that single image as QEMU USB storage. It is useful for manual resolver inspection, but it does not replace physical NUC acceptance.
- `korri-live-usb-developer-qemu` and `korri-live-usb-developer-qemu-persistence` provide the same manual QEMU surfaces for the Developer ISO.
- Set `KORRI_QEMU_PREP_ONLY=1` with any QEMU app to prepare evidence/images without launching QEMU.

Write the resulting ISO to removable USB media with the operator's preferred imaging tool, then create a second partition on the same USB device labeled `KORRI-PERSIST` for persistent client state. Do not create or select a persistence partition on the NUC internal disk. Product ISO can boot in clearly marked ephemeral mode if that partition is absent. Developer ISO should be validated only with same-stick persistence present because missing retention is a visible failure.

If a USB stick was used with the old broad-home layout (`/persist/korri-live-usb/home`), reset it before Product acceptance: delete the old broad-home directory or recreate the `KORRI-PERSIST` filesystem, then let the Product ISO create `/persist/korri-live-usb/product` from a known state. Do not copy old broad-home contents into the Product namespace except for individually reviewed files that match the allowlist.

Physical v1 acceptance targets an 8th-gen Intel NUC with Ethernet, keyboard fallback, and an XInput-compatible wired USB controller. QEMU validation increases confidence, but it does not replace physical NUC acceptance. Before boot, record the internal disk identity or a sentinel hash. After booting from USB, verify:

- the TV reaches the Korri kiosk surface without an installer workflow;
- the internal disk sentinel is unchanged;
- `/persist/korri-live-usb` is either the same-stick `KORRI-PERSIST` partition or, for Product ISO only, an ephemeral tmpfs marked `.korri-live-usb-ephemeral`;
- standard discovery sees compatible Korri servers on the wired LAN without host-name special cases;
- Product ISO settings and moonlight-embedded pairing/cache state survive a reboot when same-stick persistence is present;
- a non-allowlisted Product home/cache file does not survive a reboot;
- Developer ISO is visibly labeled as Developer ISO and retains broad Developer state only under its Developer namespace;
- booting Product ISO after Developer ISO does not expose Developer-only broad state;
- InputPlumber is active, sees its package data root, and exposes exactly one expected virtual Xbox-class gamepad for the connected controller;
- inputd and Moonlight both consume the InputPlumber virtual gamepad, not the raw physical controller;
- selecting a remote game prepares the known game on the connected server and attempts a local `moonlight-embedded` stream with an explicit virtual input device.

RockNix-backed kiosk appliances are exposed as explicit device targets:

```bash
nix build .#packages.aarch64-linux.korri-rocknix-kiosk-system-thor
nix build .#packages.aarch64-linux.korri-rocknix-kiosk-system-odin2portal
nix build .#korri-rocknix-rootfs-thor
nix build .#korri-rocknix-rootfs-odin2portal
nix build .#korri-rocknix-product-payload-odin2portal
nix build .#korri-rocknix-product-payload-thor
```

Matching NixOS configurations are available as:

- `nixosConfigurations.korri-rocknix-kiosk-thor`
- `nixosConfigurations.korri-rocknix-kiosk-odin2portal`
- `nixosConfigurations.korri-rocknix-kiosk-by-compatible`

Thor and Sobo/Odin 2 Portal are kiosk appliances only. They include the Korri server, Electrobun client, Sway kiosk, and inputd; they are not server-only RockNix targets. The by-compatible configuration is an impure on-device convenience that reads the normalized device-compatible value through nix-on-rocks. Use the explicit per-device targets for off-device review and Fuji/aarch64 build gates.

These are evaluated NixOS system closures or rootfs tarball packages, not a full OTA/update product. Manual installation, partitioning, flashing, rollback UX, and remote builder selection remain operator/platform concerns.

`korri-rocknix-product-payload-odin2portal` and `korri-rocknix-product-payload-thor` are additive candidate payloads for the Korri-to-nix-on-rocks handoff. They wrap the existing per-product rootfs outputs under seed-contract archive names such as `rocknix-guest-rootfs-odin2portal-<korri-rev>.tar.zst` and `rocknix-guest-rootfs-thor-<korri-rev>.tar.zst`, then emit candidate metadata under `nix-support/product-payload/`. They do not replace the existing rootfs aliases, do not publish a `by-compatible` seed identity, and are consumed only by the nix-on-rocks per-product selector seam.

Candidate payload metadata contains the facts the Nix build can know: authority repository, source subdir, explicit product build target, device id, compatible string, seed archive name/checksum, Korri revision marker, and nix-on-rocks substrate revision. Final promotion metadata requires external immutable facts that Nix cannot infer locally: the clean Korri source revision, GitHub source tarball SHA256, and direct release download URL(s). Use `tools/artifacts/rocknix-product-payload-finalize.ts` to combine those external values with the candidate lock and render device-named final files such as `product-payload-odin2portal.lock` or `product-payload-thor.lock` plus matching `.env` files for the nix-on-rocks selector seam.

The manual `RockNix Product Payload` workflow evaluates the candidate package/check by default for a matrix of `odin2portal` and `thor`. Its opt-in build path can upload one candidate payload artifact per product when an appropriate builder is available, and can emit final metadata when the operator supplies source SHA, clean revision, and release URL inputs. This workflow is not an SM8550 image build, update-tar acceptance path, seed staging proof, recovery boot proof, or device boot acceptance gate.

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

### Substrate capability boundary

The SM8550 platform adapter (`nix/images/platforms/rocknix-sm8550.nix`) reads neutral substrate-owned capability options from nix-on-rocks and translates them into Korri product policy. The ownership rule:

- **nix-on-rocks** says: "this device/chipset exposes these Linux capabilities and routes audio/video here."
- **Korri** says: "for a Korri appliance, use those capabilities with Moonlight, sessiond, and kiosk policy."

Current neutral capabilities consumed by the Korri SM8550 platform adapter:

| Substrate option | Korri product use |
| --- | --- |
| `rocknix.sm8550.video.decodeBackend` | Mapped to Moonlight Embedded's `-platform` flag via `KORRI_MOONLIGHT_PLATFORM`. Default is `v4l2m2m` (hardware-accelerated Iris V4L2 mem2mem). Mapping is identity today because Moonlight Embedded shares the substrate's name. |
| `rocknix.sm8550.audio.api` | Mapped to `SDL_AUDIODRIVER` on the compositor and sessiond units. Default is `pulseaudio`; PipeWire-pulse's compatibility socket is the substrate's promised entry point. |
| `rocknix.sm8550.audio.defaultSink.*` | Per-device speaker-route bootstrap owned by nix-on-rocks (UCM verb + ALSA sink). Thor declares the live-validated speaker PCM (`hw:0,0`); Odin 2 Portal leaves it null until physically validated, so its substrate creates no `main-space-audio-sink-bootstrap` unit. |

Guidance for adding a new SM8550 chipset fact, a per-device quirk, or a Korri policy:

- **New SM8550 capability** (shared across Thor and Odin 2 Portal): add the option under `rocknix.sm8550.*` in the nix-on-rocks `chipsets/sm8550/` folder. Do not introduce it under `rocknix.sm8550.moonlight.*` or any other client-specific namespace; the substrate is product-blind.
- **Per-device hardware quirk** (display topology, audio sink PCM, input event name): add it to the device profile in `nix-on-rocks/guest/profiles/devices/<device>.nix`. Korri does not need to know.
- **Per-device Korri-product behavior** (kiosk presentation, launch policy, Korri service tuning): add it to the appropriate Korri module or to `nix/images/platforms/rocknix-sm8550.nix`. Do not push it into the substrate.
- **Moonlight CLI shape, mapping file, key/cache dir, startup observe window**: stays in Korri. The substrate exposes the audio/video capabilities those choices depend on, but the client and its argv are Korri's responsibility.

The Gamescope >= 3.16.20 assertion in the platform adapter is gated on the substrate-declared video decode backend so the constraint's reason stays machine-checkable. The substrate-side `rocknix.sm8550.moonlight.*` option group is scheduled for removal once Korri's trunk stops setting it (which this Korri release already does); see the substrate refactor follow-up PR for the cleanup.
