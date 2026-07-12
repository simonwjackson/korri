---
id: 01KX9PC5N6A7XXY1GHFY5PGC6S
slug: add-generic-gaming-fan-control-service-with-thor-bandai-curv
title: Add generic gaming fan-control service with Thor/Bandai curve
origin: parked
status: In Progress
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

This must be a systemic, fleet-wide approach: one module every Korri device image gets. Any fan-equipped device works out of the box with a sane generic curve; a device configures its own curve only when it wants to deviate.

## Acceptance Criteria

- [ ] Provides one declarative NixOS module shared across all Korri device images (systemic, not per-device one-offs).
- [ ] Ships a sensible generic temperature-to-PWM curve that any fan-equipped device gets by default with zero device-specific config.
- [ ] Devices can optionally override with their own curve; Bandai/Thor overrides with a gaming curve roughly matching public Thor guidance: ~45C=>45%, ~65C=>70%, ~85C=>100%.
- [ ] Hardware discovery is robust (e.g. resolves the PWM/temp devices by identity, not fragile hwmon indexes that shift across reboots).
- [ ] Service restores automatic/default fan control on stop and has a safety fallback (a dead service must never leave the fan pinned low under load).
- [ ] Fanless devices or devices without writable PWM controls opt out cleanly (module present, no-op).
- [ ] Runtime telemetry exposes current temp, PWM, RPM, and selected profile (generic vs device override).

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
