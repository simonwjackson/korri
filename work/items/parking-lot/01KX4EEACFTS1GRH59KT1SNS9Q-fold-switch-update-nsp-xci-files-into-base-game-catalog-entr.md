---
id: 01KX4EEACFTS1GRH59KT1SNS9Q
slug: fold-switch-update-nsp-xci-files-into-base-game-catalog-entr
title: Fold Switch update NSP/XCI files into base game catalog entries
origin: parked
status: To Do
priority: medium
labels:
  - catalog
  - switch
  - ryubing
  - scanner
created: 2026-07-09
source: user
---

# Fold Switch update NSP/XCI files into base game catalog entries

## Why it matters

Bandai's removable-media scanner currently treats Switch update content as separate playable games, which creates duplicate-looking entries for titles like Metroid Dread, Hyper Light Drifter, and Gabby’s Dollhouse. The catalog should understand update/DLC package identity and attach updates to the base game instead of surfacing them as games.

## Acceptance Criteria

- [ ] Switch update packages are detected as updates rather than standalone games.
- [ ] Base game catalog entries can reference associated update files when useful for launch/materialization.
- [ ] The scanner no longer creates duplicate playable entries for update-only Switch files.
- [ ] Existing SD cards with update files rescan without showing the update packages as separate games.

## Related

- `/var/lib/korri/config/korri.yaml`
- `/run/media/korri/fc1f2bfc-b6ea-42ca-8d6b-a1c8aac4f551/.korri/auto.korri.yaml`

## Notes

Observed on Bandai: update-like entries include metroid-dread-010093801237c800-v327680, hyper-light-drifter-special-edition-v196608, and dreamworks-gabby-s-dollhouse-ready-to-party-0100f69020bd8800-v65536. Temporary device-side mitigation is to remove those entries from catalog YAML, not delete SD files.
