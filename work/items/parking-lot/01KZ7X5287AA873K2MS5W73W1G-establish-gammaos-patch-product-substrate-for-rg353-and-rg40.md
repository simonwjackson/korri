---
id: 01KZ7X5287AA873K2MS5W73W1G
slug: establish-gammaos-patch-product-substrate-for-rg353-and-rg40
title: Establish GammaOS patch-product substrate for RG353 and RG405 KorriOS
origin: parked
status: To Do
priority: medium
labels:
  - korrios
  - android
  - gammaos
  - rg353
  - rg405
  - upstream-intake
  - nix
created: 2026-08-05
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: main
  commit: 3543b1c5
  repo: korri
  invoked_by: user
---

# Establish GammaOS patch-product substrate for RG353 and RG405 KorriOS

## Why it matters

KorriOS should preserve GammaOS’s valuable handheld hardware enablement while replacing its launcher, bundled applications, permissive security choices, and provisioning. A pinned upstream plus ordered patch queue could provide the same auditable update model used for ROCKNIX, but RG405 source-to-release provenance is unclear and RG353 GammaOS Core currently exposes release binaries without its build source.

## Acceptance Criteria

- [ ] Inventory GammaOS system, vendor, boot, kernel, firmware, and build-tool inputs separately for RG353 and RG405.
- [ ] Map the RG405 GammaOS Next v1.1 release to an exact GammaOSNextDistribution-14 source revision, or document the missing provenance.
- [ ] Determine whether RG353 can use published GammaOS Next/Nano source, requires GammaOS Core source from its author, or must begin as explicitly temporary binary image surgery.
- [ ] Compare two maintenance models: patching GammaOS down versus starting from LineageOS/TrebleDroid and importing only GammaOS hardware-enablement changes.
- [ ] Define assignment-only lock files pinning all source and binary authorities with hashes, not merely one Git revision.
- [ ] Define an ordered KorriOS patch queue and upstream-intake workflow analogous to Nix-on-Rocks.
- [ ] Define automated image contracts covering the Korri launcher/korrid, package absence, SELinux enforcing, no Magisk, production adb policy, licensing, partition structure, and core hardware behaviour.
- [ ] Produce a recommendation and a minimal reproducible build/patch spike for at least one target device.

## Related

- `AGENTS.md`
- `docs/research/`

## Notes

GammaOS and its current successors declare Apache-2.0, but complete images contain mixed-license components. RG405’s modern source is in TheGammaSqueeze/GammaOSNextDistribution-14; the release wrapper does not clearly identify the source SHA used for v1.1. GammaOSCore’s public repository contains README/LICENSE/releases but no build source. Treat a binary-locked RG353 image only as a bootstrap experiment, not the preferred durable substrate. Preserve device bring-up, drivers, display/input/audio/network/suspend/thermal work; plan to remove bundled apps, Gamma UI/provisioning, Google services, Magisk/root, permissive SELinux, signature spoofing, and unnecessary storage/package-verification relaxations.
