---
id: 01KX9PC5N6A7XXY1GHFY5PGC6S
slug: add-generic-gaming-fan-control-service-with-thor-bandai-curv
title: Add generic gaming fan-control service with Thor/Bandai curve
origin: parked
status: To Do
priority: high
labels:
  - thermal
  - fan-control
  - sm8550
  - nixos
created: 2026-07-11
source: user
---

# Add generic gaming fan-control service with Thor/Bandai curve

## Why it matters

Bandai/Thor exposes a PWM fan, but the current Linux thermal policy maps max cooling state to a quiet PWM level and allows SM8550 gaming loads to reach ~90C. A shared NixOS fan-control module would make active cooling reliable across all fan-equipped Korri devices while allowing device-specific curves.

## Acceptance Criteria

- [ ] Provides a declarative NixOS module for temperature-to-PWM curves with per-device profiles.
- [ ] Bandai/Thor profile applies a gaming curve roughly matching public Thor guidance: ~45C=>45%, ~65C=>70%, ~85C=>100%.
- [ ] Service restores automatic/default fan control on stop and has a safety fallback.
- [ ] Fanless devices or devices without writable PWM controls opt out cleanly.
- [ ] Runtime telemetry exposes current temp, PWM, RPM, and selected profile.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
