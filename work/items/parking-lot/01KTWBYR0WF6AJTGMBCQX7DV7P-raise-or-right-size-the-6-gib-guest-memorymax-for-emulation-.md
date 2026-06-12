---
id: 01KTWBYR0WF6AJTGMBCQX7DV7P
slug: raise-or-right-size-the-6-gib-guest-memorymax-for-emulation-
title: Raise or right-size the 6 GiB guest MemoryMax for emulation workloads
origin: parked
status: To Do
priority: high
labels:
  - nix-on-rocks
  - substrate
  - memory
created: 2026-06-11
source: se-debug
---

# Raise or right-size the 6 GiB guest MemoryMax for emulation workloads

## Why it matters

rocknix-guest.service caps the entire NixOS guest at MemoryMax=6442450944 on a 16 GB device. Switch emulation + compositor + portal + korrid share it; memcg OOM kills and failed mmap commits surface as opaque Ryujinx AccessViolations / LibHac aborts ~6 s into every launch (bandai 2026-06-11, dmesg CONSTRAINT_MEMCG). Working launches are luck, not headroom. Decide the right split (host needs little — it's a thin substrate) and raise the cap in nix-on-rocks.

## Acceptance Criteria

- [ ] Guest MemoryMax raised (or made device-proportional) in rocknix-guest-substrate
- [ ] A Switch game plus full kiosk stack runs without memcg OOM
- [ ] Decision documented for the host/guest memory split
