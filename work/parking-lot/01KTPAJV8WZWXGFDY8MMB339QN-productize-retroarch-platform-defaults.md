---
id: 01KTPAJV8WZWXGFDY8MMB339QN
slug: productize-retroarch-platform-defaults
title: "Productize RetroArch platform defaults"
origin: parked
legacy: backlog/task-076
status: To Do
priority: low
labels:
  - "retroarch"
  - "platform-defaults"
  - "config"
created: 2026-06-08
source: se-challenge-plan
---

# Productize RetroArch platform defaults

## Why it matters

The full RetroArch config plan intentionally avoids shipping device/platform default fragments in the first wave. Once the typed surface stabilizes, device-specific defaults should move into readable YAML fragments instead of hidden renderer behavior or ad-hoc operator config.

## Acceptance Criteria

- [ ] Identify platform classes that need RetroArch defaults.
- [ ] Represent each platform default as readable RetroArch policy data.
- [ ] Add tests or validation proving platform defaults compose through the normal readable cascade.

## Related

- `docs/plans/2026-06-08-004-feat-full-retroarch-config-plan.md`
- `product/systems/nixos/modules/korri-server.nix`
- `docs/brainstorms/2026-06-08-004-retroarch-policy-minimal-v1.example.yaml`
