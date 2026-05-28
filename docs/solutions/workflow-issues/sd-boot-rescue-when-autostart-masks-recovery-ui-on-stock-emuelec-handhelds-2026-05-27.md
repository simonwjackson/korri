---
title: SD-boot rescue when autostart masks the recovery UI on stock-OS handhelds
date: 2026-05-27
category: workflow-issues
module: handheld-recovery
problem_type: workflow_issue
component: tooling
severity: high
applies_when:
  - A stock-OS handheld (EmuELEC, JELOS, ROCKNIX, ArkOS, RetroMaxOS) has had EmulationStation masked as part of installing an autostart kiosk
  - The kiosk's autostart fails or networking drops, leaving no on-device path to recovery
  - The device boots from internal eMMC by default, but the SoC family supports SD-card boot priority (most Rockchip/Allwinner clones do)
  - Re-flashing the eMMC via RKDevTool/MaskROM is undesirable because user state on `/storage` should be preserved
  - A spare microSD and a Windows or Linux PC with a card reader are available
symptoms:
  - Device boots and shows the kiosk on screen, but no IP appears on the LAN
  - SSH is unreachable on the configured port and the broadcast IP
  - The on-device WiFi setup UI is hidden because EmulationStation is masked
  - mDNS shows no advertise from the device (no `_korri-stream._tcp`, no `_workstation._tcp`)
  - The device is otherwise healthy — local-only services (the portal, the api on localhost) work
related_components:
  - korri-kiosk
  - korri-api
  - emustation
  - connman
related_docs:
  - docs/solutions/best-practices/korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md
  - docs/solutions/workflow-issues/non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md
  - docs/solutions/integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md
tags:
  - emuelec
  - retromax
  - autostart
  - recovery
  - sd-boot
  - rk3326
  - rk3566
  - allwinner-h700
  - rescue
  - non-destructive
  - r36t-max
  - trimui-brick
---

# SD-boot rescue when autostart masks the recovery UI on stock-OS handhelds

## Context

The "drop systemd units into `/storage/.config/system.d/` and mask `emustation.service`" autostart pattern has one structural blind spot: **the masked service is the only on-device path to the WiFi setup screen.** When WiFi flakes after a reboot — and on these clones, it does — there is no way to recover from the device itself.

This was observed on a R36T MAX (RK3326, EmuELEC 4.7) running the Korri autostart stack:

- Kiosk autostarts at 23 s wall-clock from power-on
- Bun api on `localhost:8181` is fine
- The portal renders
- But the device never associates with the configured WiFi network after a hard power cycle
- ARP for the previously-known IP returns FAILED
- LAN sweep finds no new device
- mDNS shows no advertise

The kiosk is up but headless from the network's point of view. EmulationStation, which has a built-in WiFi setup screen, is masked. There is no `Settings → Network` route in the portal. The device is otherwise healthy.

The rescue path: **boot the device from a spare microSD** that holds a fresh stock-OS image. The bootloader prefers SD over eMMC; the SD-booted OS gives you a network-connected shell from which you can mount the eMMC and either fix WiFi config there or remove the autostart masks entirely.

## Guidance

### 1. Recognize when SD-boot rescue applies

This recipe applies when **all** of the following are true:

- Device hardware is an SD-bootable clone (most RK3326/RK3566 clones, Allwinner H700 — verify by community docs for the specific model)
- eMMC has the stock OS plus your autostart layer in `/storage` (not a full re-image)
- A spare microSD is available (you do not need to sacrifice the one with your data partition)
- The stock OS for this device has a public image (R36T MAX uses ArkOS4Clone or AISLPC's RetroMaxOS; TRIMUI Brick uses spruce/RetroOS)
- You have access to a Windows or Linux PC with a card reader

It does **not** apply to:

- Devices that lock the boot order to eMMC in fuses (rare in this class but possible)
- Devices whose `/storage` has been formatted or whose partition table has been wiped — at that point you're not "rescuing", you're re-imaging
- Cases where the kiosk itself is the actual problem (crashloop) — in that case the SD-boot still works as a recovery, but you don't strictly need it; an SSH-side recovery via the panic-SSH unit would have caught this

### 2. Build the rescue SD card

The standard recipe for the R36-class clones (from `retrohandhelds.gg`):

1. Download a fresh OS image suitable for the device. ArkOS4Clone works on most R36 variants; ROCKNIX images target a wider range; the device manufacturer's own image is the safest if available.
2. Flash to a spare microSD (≥ 8 GB) with Balena Etcher or `dd`.
3. **For Rockchip clones with non-trivial panels (R36T MAX, R36 Ultra), run the `DTB_Selector_Win32.exe` from the SD card's BOOT partition before inserting.** The selector writes the correct Device Tree for the panel/touch/audio. Without this, the rescue boot comes up with a black screen.
4. Pick `Brand: AISLPC → Model: R36T/MAX → Language: English` (or the equivalent for your device).

The DTB selector is not optional on these clones. Many users have bricked the rescue boot itself by skipping it.

### 3. Boot the device from the rescue SD

1. Power off
2. Insert the rescue SD (in the boot slot, which on R36-class is typically TF1; consult the device's specific docs)
3. Power on
4. The bootloader picks SD over eMMC and the rescue OS boots
5. Use the rescue OS's on-device WiFi setup to join your network — this writes config to **the SD card's** `/storage`, not the eMMC, so it does not interfere with your existing kiosk state
6. Note the IP, SSH in

If the rescue OS does not bring up SSH automatically, on EmuELEC: `connmanctl enable wifi`, scan, connect; SSH is on `:22` by default with `root` / `emuelec` (or blank).

### 4. Mount the eMMC's /storage and choose your rescue

From the rescue-booted shell, the eMMC's user partition is `/dev/mmcblk0p5` on R36-class (verify with `lsblk`):

```sh
mkdir -p /mnt/emmc
mount /dev/mmcblk0p5 /mnt/emmc
ls /mnt/emmc/.config/system.d/
```

You should see your `korri-*.service` files and the `emustation.service → /dev/null` mask symlink.

Now choose:

| Goal | Action |
|---|---|
| **Just un-mask ES to recover WiFi via stock UI** | `rm /mnt/emmc/.config/system.d/emustation.service` |
| **Disable kiosk entirely; boot to stock ES** | Run your revert script: `sh /mnt/emmc/korri-revert.sh /mnt/emmc` (assuming you wrote one — see autostart doc) |
| **Fix WiFi config directly without un-masking** | Edit `/mnt/emmc/.cache/connman/*.config`; restart on next boot |
| **Preserve everything but never lose recovery again** | Add a `korri-rescue.service` that exposes WiFi setup over the api — see "Why This Matters" |

For the un-mask path:

```sh
rm /mnt/emmc/.config/system.d/emustation.service
sync
umount /mnt/emmc
```

Power off, eject SD, power on → device boots eMMC normally → stock ES appears alongside or instead of the kiosk → use ES to fix WiFi → SSH is back.

### 5. Keep the rescue SD as a permanent kit

Once built and DTB-configured, the rescue SD has zero downside. Store it labeled in the device's case or with the user docs. It is the **only** reliable recovery for autostart-masked stock-OS handhelds.

If you ship the device to others, ship the rescue SD with it.

### 6. Wire a panic-SSH unit that does not depend on userspace state

The autostart doc already calls out an independent SSH unit (dropbear on `:2222`) as a panic-recovery channel. **The SSH unit only helps if the network is up.** When the network itself is the problem (this case), SD-boot is the only rescue.

So: ship both. The SSH-on-:2222 unit catches crashloop + working WiFi. The SD-boot rescue catches WiFi failure regardless of crashloop.

## Why This Matters

The autostart-via-`/storage/.config/system.d/` pattern is correct and we should keep using it. But it has an irreversible-from-the-device-itself failure mode: if you mask the recovery UI and the network dies, you are stuck.

The SD-boot rescue restores a property the pattern silently removes: **always-recoverable from the device itself, with only a spare SD card.** That property is normally provided by the stock UI's WiFi setup screen; we replaced it with the kiosk. Without the rescue, the only fallback is RKDevTool over USB-C, which is Windows-only, requires entering MaskROM, and risks bricking the eMMC.

A second-order win: the rescue SD doubles as a development bench. You can boot the device into a known-good OS at any time without disturbing your `/storage` state. Useful for diffing behavior, testing kernel patches, or checking whether a regression is yours or upstream's.

Future direction: make the kiosk's portal expose a `Settings → Network → WiFi` route so that pure-software recovery is also possible. Until then, the SD-boot rescue is the only complete recovery story.

## When to Apply

- After any reboot where the device shows the kiosk locally but is unreachable on the LAN
- Before any change to WiFi config on a remote/unattended device (build the rescue SD first, then change config)
- When shipping an autostart-kiosk handheld to a user, include the rescue SD

Do not apply when:

- The device is reachable over SSH — fix WiFi from the existing shell instead
- You are about to re-image the eMMC anyway — flash directly to eMMC

## Examples

### R36T MAX (RK3326, EmuELEC 4.7) — verified failure mode

After three reboots with the Korri autostart stack:

```
ARP   192.168.1.227          FAILED
LAN sweep (/24, ports 22/2222/8181)   no device
mDNS  _korri-stream._tcp     no advert
mDNS  _workstation._tcp      no advert
```

Device screen shows the portal. The api on localhost responds. WiFi association never completed.

Recovery via SD-boot:

```
1. Flash ArkOS4Clone latest to spare 32 GB microSD
2. Run DTB_Selector_Win32.exe → AISLPC → R36T/MAX → English
3. Insert rescue SD, power on → ArkOS4Clone boots
4. ArkOS WiFi setup → join network → SSH up at new IP
5. ssh root@<rescue-ip>
   mount /dev/mmcblk0p5 /mnt/emmc
   rm /mnt/emmc/.config/system.d/emustation.service
   sync; umount /mnt/emmc
6. Power off, eject rescue SD
7. Power on → stock ES appears → re-configure WiFi → SSH on :2222 back online
```

### TRIMUI Brick (Allwinner H700) — anticipated

Same recipe with spruce or RetroOS as the rescue image. The Brick's eMMC layout is slightly different (consult the device's wiki) and the DTB story is simpler (Allwinner uses a single DTB; less risk of black screen on a fresh image). The bootloader still prefers SD over eMMC.

## Related

- [korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27](../best-practices/korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md) — the pattern this doc rescues
- [non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27](./non-destructive-stock-os-recon-via-emulationstation-launchers-r36t-max-2026-05-27.md) — non-destructive first contact before any masking
- [runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03](../integration-issues/runtime-mask-essway-to-stop-emulationstation-relaunching-during-odin-kiosk-sessions-2026-05-03.md) — earlier ROCKNIX-side masking pattern
- `retrohandhelds.gg` AISLPC R36T/MAX setup guide — source for the DTB_Selector convention
