---
id: 01KVR919GWFC4QM4X1GH9J23FK
slug: repair-remap-wrapper-policy-transport-for-setuid-launches
title: Repair Remap wrapper policy transport for setuid launches
origin: parked
status: To Do
priority: high
labels:
  - remap
  - yfs
  - sobo
  - sm8550
created: 2026-06-22
source: user
---

# Repair Remap wrapper policy transport for setuid launches

## Why it matters

YFS Remap wiring dry-runs correctly, but real Sobo launches fail immediately because /run/wrappers/bin/korri-remap-bridge does not receive KORRI_REMAP_* environment variables after setuid wrapper sanitization. Until policy/runner data is passed through a safe wrapper-compatible channel, any launch.with @korri:remap config will compose but fail at runtime.

## Acceptance Criteria

- [ ] Remap launch.compose passes policy and runner identity to korri-remap-bridge through a channel preserved by the NixOS setuid wrapper, such as argv or a protected launch file descriptor/path.
- [ ] A real Sobo launch through /run/wrappers/bin/korri-remap-bridge reaches native-driver instead of exiting with 'KORRI_REMAP_RUNNER_USER must be korri-remap-runner'.
- [ ] Remap bridge tests cover the setuid-wrapper-compatible transport rather than only the unwrapped package path.
- [ ] YFS Remap candidate can be re-enabled and at least reaches the next runtime validation gate.

## Related

- `product/plugins/remap/src/launch-wrapper.ts`
- `product/plugins/remap/packages/korri-remap-bridge/index.ts`
- `product/plugins/remap/nix/nixos-module.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `29fd1bc78e9c`

## Notes

Sobo experiment: dry-run wrapped yfs-launch with /run/wrappers/bin/korri-remap-bridge and full KORRI_REMAP_POLICY_JSON env, but real launch exited 1. Manual reproduction with sudo -u korri env KORRI_REMAP_RUNNER_USER=... /run/wrappers/bin/korri-remap-bridge also printed 'korri-remap-bridge: KORRI_REMAP_RUNNER_USER must be korri-remap-runner', indicating env sanitization before bridge index.ts. Sobo rolled back to /nix/store/is6nm96qc8l6jiv08076lvfv39y3zsxw-nixos-system-sobo-25.11pre-git.
