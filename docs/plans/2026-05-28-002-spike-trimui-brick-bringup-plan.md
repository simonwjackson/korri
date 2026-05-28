---
title: "spike: TRIMUI Brick KORRI bringup (Knulli host, SD-only)"
type: spike
status: active
date: 2026-05-28
origin: docs/solutions/architecture-patterns/staged-layer-adoption-for-constrained-handheld-bringup-2026-05-27.md
verify_command: "ssh root@<brick-ip> '/storage/run-moonlight.sh stream <aka-ip> -platform sdl -app \"Desktop\"' produces a visible stream for >30 s"
related_docs:
  - docs/solutions/best-practices/korri-autostart-via-systemd-units-on-stock-emuelec-handheld-2026-05-27.md
  - docs/solutions/best-practices/moonlight-embedded-korri-bringup-on-aarch64-handheld-2026-05-27.md
  - docs/solutions/best-practices/chunked-nix-closure-transfer-over-flaky-wifi-2026-05-27.md
  - docs/solutions/runtime-errors/busybox-tar-silently-drops-symlinks-on-closure-extract-2026-05-27.md
  - docs/solutions/best-practices/korri-api-on-aarch64-handheld-via-bun-bundle-2026-05-27.md
  - docs/solutions/best-practices/electrobun-renderer-on-aarch64-handheld-via-cohesive-nix-closure-2026-05-27.md
  - docs/solutions/workflow-issues/sd-boot-rescue-when-autostart-masks-recovery-ui-on-stock-emuelec-handhelds-2026-05-27.md
---

# spike: TRIMUI Brick KORRI bringup (Knulli host, SD-only)

## Summary

Replay the R36T MAX spike sequence on a TRIMUI Brick (Allwinner A133P, PowerVR GE8300, 1 GB RAM, 3.2" 1024×768) by treating Knulli (Batocera fork) as the host OS. The Brick is SD-card-driven by design, so the entire spike is bounded by "what fits on one SD card" and is reversible by ejecting that card. The eMMC stays untouched throughout.

The goal is not to ship a product on this device. The goal is to validate that the bringup recipes captured during the R36T MAX venture (autostart units, cohesive Nix closures, manifest-driven launchers, chunked WiFi transfer, busybox tar symlink replay, moonlight via SDL) transfer to a second physical handheld with different SoC (Allwinner vs. Rockchip), different GPU vendor (PowerVR vs. Mali), and different host OS (Knulli/Batocera vs. EmuELEC). Whatever new patterns surface get captured in `docs/solutions/`.

## Problem Frame

The R36T MAX spike produced a complete pattern set for bringing a custom KORRI userspace up on a stock-OS aarch64 handheld. That pattern set has not yet been proven on a second device. Without a second proof point, we don't know which patterns are device-specific accidents vs. general handheld-class invariants. The Brick is the right second target because it differs from the R36T MAX along every axis that matters (SoC family, GPU, vendor OS, panel) except aarch64 + handheld-class WiFi.

A secondary frame: the Brick's SD-driven boot architecture eliminates the recovery story that dominated the end of the R36T MAX spike. The Brick cannot enter the masked-ES-no-WiFi failure mode because ejecting the SD reverts to the stock OS on eMMC. This makes the Brick a better learning device: experiments are cheaper and we can be more aggressive.

A tertiary frame: TrimUI publishes no kernel or u-boot source for the Brick. Knulli's image carries those as binary blobs extracted from stock firmware. This puts a hard ceiling on "own the stack" ambition for this device — a true mainline-kernel NixOS is not realistic. Path A (stage onto Knulli) and Path B (NixOS rootfs on top of Knulli's kernel/u-boot/blobs) remain feasible; Path C (full mainline NixOS) is out of scope.

## Requirements

- R1. Boot Knulli Scarab 2026-05-11 from a fresh SD card without touching the Brick's eMMC. Verify the device comes up to EmulationStation and accepts SSH.
- R2. Capture a complete first-contact recon snapshot of the Knulli host (os-release, kernel, glibc, DRM/fb, PowerVR module state, /userdata layout, systemd unit dirs, network) before any modification. Recon script must be reusable on the next handheld.
- R3. Identify where on the Knulli/Batocera host our custom systemd units belong. This is the Brick analog of EmuELEC's `/storage/.config/system.d/`. Confirmed candidate: `/userdata/system/services/` plus `/userdata/system/custom.sh`. R3 is met when we have an autostart unit that survives reboot and produces a known-good log line.
- R4. Ship the `moonlight-embedded-korri` Nix closure to the Brick using the chunked-transfer + busybox-tar-symlink-replay recipes. R4 is met when `moonlight --help` produces a clean usage banner on the device.
- R5. Pair against Sunshine on aka (192.168.1.117) via raw IPv4 and stream at least one Sunshine app at `-platform sdl` for ≥30 s with audio. R5 is met when a Sunshine-side stream session is observed and the device-side process exits 0 on disconnect.
- R6. Document delta findings vs. R36T MAX in a new solution doc. Required topics: Knulli vs. EmuELEC autostart hook differences (custom.sh vs. drop-in), PowerVR GE8300 fbdev userspace state (no Wayland path yet), Allwinner partition layout differences, any pattern that needed real adjustment.
- R7. Spike is reversible at every step by ejecting the SD card. The eMMC is never written to. The Brick must boot back to stock CrossMix on SD eject.
- R8. Defer all PowerVR/Wayland userspace work to a follow-up spike. First light targets `-platform sdl` software decode and fbdev only. Cage + Electrobun on PowerVR is out of scope.

## Scope Boundaries

- **In scope:** Knulli as host. Moonlight client via SDL/fbdev. Autostart of a minimal KORRI api on a localhost port. Chunked closure shipping. Recon snapshot. One solution doc capturing deltas.
- **Out of scope:** Wayland on PowerVR. Cage + Electrobun on Brick. Bun api + portal on Brick (defer until SDL stream works). Hardware decode (no v4l2m2m support known on A133P). Replacing Knulli's kernel/u-boot. Mainline kernel work. Path B (NixOS rootfs on Knulli kernel). Any eMMC write.
- **Explicitly deferred:** Brick Wayland userspace spike (separate). Brick electrobun spike (separate). Brick gamepad input integration via SDL controller DB (separate).

## Approach

Stage-by-stage, modeled directly on the R36T MAX sequence. Each stage's exit criterion is a captured artifact. If any stage fails for >1 hour, stop and revisit.

### U1 — First boot + SSH (analog of R36T MAX B0a)

1. SD already flashed with Knulli Scarab 2026-05-11 (`knulli-a133-trimui-brick-scarab-20260511.img.gz`, sha256 `2c6e059b0f...5421f`).
2. Insert SD into Brick, power on. Expect: Knulli boot logo → first-boot script → SHARE autoresize from 512 MB to ~58 GB exFAT → reboot → EmulationStation.
3. From ES: Start → Network → enable WiFi, join LAN. Note IP.
4. From ES: Start → System Settings → Network → enable SSH (Knulli Scarab requires this be toggled explicitly).
5. SSH from host: `ssh root@<brick-ip>` (default password is `linux` until changed via Knulli menu).

**Exit criterion:** working SSH session, `whoami` returns `root`.

### U2 — Recon snapshot (analog of R36T MAX `r36t-max-ssh/snapshot/`)

1. `scp out/tmp/brick-ssh/recon.sh root@<brick-ip>:/tmp/recon.sh`
2. `ssh root@<brick-ip> 'sh /tmp/recon.sh' > out/tmp/brick-ssh/recon-1.txt`
3. Review for: glibc version (must be ≥ 2.36 for moonlight closure compat), /userdata mount point, presence of `/dev/dri/card0` and `/dev/fb0`, PowerVR `pvrsrvkm` module load state, location of `/userdata/system/services/`.

**Exit criterion:** `recon-1.txt` committed to host (or saved out of repo); known answers to: where do we drop units, what glibc do we ship for, does fbdev exist.

### U3 — Autostart hook smoke (analog of R36T MAX K1)

1. Pick the smallest possible autostart unit: a `korri-hello.service` that writes a timestamp to `/userdata/system/logs/korri-hello.log` on boot.
2. Choose location based on recon — likely either `/userdata/system/services/korri-hello.service` (Batocera convention, picked up by `batocera-services`) or `/userdata/system/custom.sh` (Batocera early-boot shell hook).
3. Reboot. Confirm log line exists.

**Exit criterion:** autostart fires on cold boot, log line present, no kiosk lock-in. Reboot-to-stock path is still trivial: eject SD.

### U4 — Closure shipping (analog of R36T MAX K2)

1. On `fuji`: build `moonlight-embedded-korri`, compute closure paths, generate symlink manifest, split into 40-path chunks.
2. From host: ssh to Brick, mkdir `/userdata/nix/store`. Note Brick may or may not allow a bind from `/nix` — if not, run the launcher with `/userdata/nix/store` path.
3. Chunked transfer + post-extract symlink replay (verbatim from the chunked-transfer and busybox-tar-replay docs).
4. Verify path count matches and `find /userdata/nix/store -type l | wc -l` matches builder count.

**Exit criterion:** closure fully landed, symlink count matches builder, no missing-path warnings.

### U5 — Moonlight first light (analog of R36T MAX M1)

1. Ship the launcher script `/userdata/run-moonlight.sh` from the moonlight-bringup doc.
2. `moonlight --help` produces the usage banner with no `not found` errors. This proves the LD path and the symlink replay.
3. `moonlight pair 192.168.1.117` reaches Sunshine. Enter the PIN on aka's Sunshine web UI.
4. Stop EmulationStation (Knulli analog: `batocera-services stop emulationstation`), set a safety-net timer to restart it in 90 s.
5. `moonlight stream 192.168.1.117 -platform sdl -app "Desktop"` over fbdev directly.

**Exit criterion:** Sunshine logs an active stream session, screen on the Brick shows the desktop, audio plays, disconnect exits cleanly.

### U6 — Cancel the safety net + write the delta doc (analog of R36T MAX learning doc)

1. After U5 green, cancel the ES restart timer and bring ES back manually so the device returns to a known menu state.
2. Write `docs/solutions/best-practices/korri-bringup-on-trimui-brick-via-knulli-2026-05-XX.md` capturing:
   - Knulli/Batocera hook differences from EmuELEC's `/storage/.config/system.d/`
   - Allwinner A133P partition layout vs. Rockchip RK3326
   - PowerVR GE8300 userspace status (fbdev-only via Knulli's `ge8300-drivers`)
   - SD-only reversibility as a property of the device, not a procedure we layered on
   - Any pattern that needed adjustment in the moonlight/closure recipes
3. Cross-link the new doc into the existing pattern set.

**Exit criterion:** doc merged, recipe inventory updated.

## Stage Gates (when to stop)

- After U2, if PowerVR module is not loaded or `/dev/fb0` is missing, stop and revisit: we may need different Knulli image (early-channel) or a wholly different host OS choice.
- After U3, if the autostart hook does not survive reboot from `/userdata/system/services/`, fall back to `custom.sh` before continuing.
- After U4, if symlink count after replay still drifts >5% from builder, stop and characterize the receiver's tar — Knulli may ship GNU tar, in which case the replay step is no-op (good) and the loss is something else.
- After U5, if pair succeeds but stream produces no frames, stop and characterize: SDL platform may need `KMSDRM` or specific framebuffer permissions. Do not escalate to `-platform ffmpeg_drm` until pair+SDL is proven on at least 480p.
- Anywhere in U1–U5, if WiFi association becomes unreliable, eject SD and restart the spike on a different network band. Do not mask EmulationStation until U3 is green (avoid Brick-equivalent of R36T MAX recovery scenario).

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Brick won't boot from SD (e.g., DTB wrong for current hardware revision) | Low | Knulli Scarab supports both Brick and Hammer revisions in one image. If fails, try Knulli Gladiator II as fallback. |
| `pvrsrvkm.ko` not present / GPU not initialized | Low-Medium | Knulli pre-vendored the GE8300 driver. If it's not loaded, U2 catches it; we still proceed because SDL/fbdev does not require PowerVR. |
| glibc mismatch between fuji-built closure and Knulli userspace | Medium | Closure carries its own ld-linux. The launcher uses `--library-path`. Same risk as R36T MAX, same mitigation. |
| Knulli's `/userdata` is exFAT after autoresize → no symlink support | High | Knulli runs symlink-heavy nix store from exFAT badly. **Mitigation**: keep our store under the SHARE partition's pre-resize section (ext4) OR put closure on a second-mounted partition we create as ext4 from SHARE leftover OR re-format SHARE to ext4 immediately after first boot (Knulli supports this via its built-in formatter). **Decide before U4.** |
| Knulli's busybox tar matches R36T MAX's behavior (drops symlinks) | High | Confirmed pattern from R36T MAX doc; the replay step is mandatory; if Knulli ships GNU tar, replay is a no-op. |
| Network drops during chunked transfer on Brick's WiFi chip | Medium | Same recipe as R36T MAX (40-path chunks, fresh SSH per chunk). |
| `-platform sdl` requires X11 not fbdev on this build | Medium | If true, fall back to `-platform ffmpeg_drm` directly. If both fail, defer Brick stream to a later spike and capture as a known limitation. |
| Knulli updates between flashing and spike completion break things | Low | Pinned to 2026-05-11 Scarab. Do not in-place upgrade during the spike. |

## Open Questions

- **OQ1:** Does Knulli's autoresize re-format SHARE to ext4 or exFAT in the 2026-05-11 image? (Doc says exFAT default since Gladiator; need to confirm post-boot.) Resolution: check U2 recon `df -hT` output. Affects U4.
- **OQ2:** Does Knulli ship dropbear or openssh? Affects ssh args. Resolution: U2 recon `which ssh dropbear`.
- **OQ3:** Default SSH password — Knulli Scarab release notes mention tighter SSH defaults. Confirm at U1.
- **OQ4:** Does the Brick's display actually show framebuffer content reliably from non-ES processes? Knulli's RGB LEDs / display init may hold the fb. Resolution: U3 can include a tiny `dd if=/dev/urandom of=/dev/fb0` test.

## Out-of-Band Outputs

- `out/tmp/brick-ssh/recon-1.txt` — first-contact recon dump
- `out/tmp/brick-ssh/known_hosts`, `id_ed25519`, `id_ed25519.pub` — per-device SSH key (mirrors `r36t-max-ssh/` layout)
- `docs/solutions/best-practices/korri-bringup-on-trimui-brick-via-knulli-2026-05-XX.md` — final learning doc

## Definition of Done

Spike is done when:

1. Brick streams from Sunshine on aka for ≥30 s at SDL/software decode, observed end-to-end.
2. SD eject still cleanly returns the Brick to stock CrossMix.
3. Solution doc covering the Knulli-specific deltas exists and is cross-linked.

Spike is **abandoned** when:

1. Three of the U-stages stall for >1 day each, OR
2. A structural blocker emerges (e.g., PowerVR refuses to release fb to non-ES processes and fbdev path is closed) that would require new patterns out of scope here.

In either abandonment case, write the partial-progress doc anyway, capturing why we stopped.
