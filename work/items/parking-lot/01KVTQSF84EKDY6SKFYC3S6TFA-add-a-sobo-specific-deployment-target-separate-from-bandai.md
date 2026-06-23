---
id: 01KVTQSF84EKDY6SKFYC3S6TFA
slug: add-a-sobo-specific-deployment-target-separate-from-bandai
title: Add a Sobo-specific deployment target separate from bandai
origin: parked
status: To Do
priority: high
labels:
  - deployment
  - sobo
  - safety
created: 2026-06-23
source: user
context:
  cwd: .
  repo: korri
---

# Add a Sobo-specific deployment target separate from bandai

## Why it matters

Using the encoded bandai deployment defaults against Sobo risks installing the wrong image/configuration on the device. A distinct Sobo target would make future validation safer and remove the need to override bandai defaults by hand.

## Acceptance Criteria

- [ ] There is a named Sobo rebuild/deploy target that does not reuse bandai image defaults.
- [ ] Deployment helpers refuse to switch bandai systems onto Sobo unless explicitly force-overridden.
- [ ] Sobo validation docs/commands use the Sobo target name.

## Related

- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/flake/configurations.nix`
