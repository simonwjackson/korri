---
id: 01KXCSN96WAKJHKREQC5CAQJ1F
slug: fix-sessiond-gpu-floor-before-hook-using-store-path-sudo-ins
title: Fix sessiond gpu-floor before-hook using store-path sudo instead of setuid wrapper
origin: parked
status: To Do
priority: low
labels:
  - steam
  - sessiond
  - sm8550
created: 2026-07-13
source: se-debug
---

# Fix sessiond gpu-floor before-hook using store-path sudo instead of setuid wrapper

## Why it matters

On Bandai every managed launch logs a failed `gpu-floor` before-hook: `sudo: /nix/store/...-sudo/bin/sudo must be owned by uid 0 and have the setuid bit set`. It runs under warn policy so the launch continues, but the GPU performance floor is never applied, and the noise masks real hook failures. The hook should invoke `/run/wrappers/bin/sudo`.

## Acceptance Criteria

- [ ] gpu-floor before-hook resolves sudo via /run/wrappers/bin/sudo
- [ ] No 'must be owned by uid 0' errors during managed launches on Bandai
- [ ] GPU floor is actually applied before foreground launches
