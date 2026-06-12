---
id: 01KTW8JKMF734GXQFSGV8JJJTH
slug: fix-rocknix-guest-service-warm-restart-wedge-nix-on-rocks-su
title: Fix rocknix-guest.service warm-restart wedge (nix-on-rocks substrate)
origin: parked
status: To Do
priority: medium
labels:
  - nix-on-rocks
  - substrate
  - deploy
created: 2026-06-11
source: se-debug
context:
  repo: nix-on-rocks
  invoked_by: bandai deploys 2026-06-11
---

# Fix rocknix-guest.service warm-restart wedge (nix-on-rocks substrate)

## Why it matters

Two-for-two: systemctl restart rocknix-guest.service on bandai hangs indefinitely tearing down the live guest (active gamescope session), killing all connectivity (tailscaled lives in the guest) and requiring a physical power-cycle. This makes every remote deploy end in a power-cycle request and would brick unattended remote updates. Likely an nspawn stop-path hang (busy mounts / session teardown / stop timeout infinity) in the rocknix-guest-substrate unit.

## Acceptance Criteria

- [ ] systemctl restart rocknix-guest.service completes within a bounded timeout with an active kiosk session
- [ ] Connectivity returns without physical intervention
- [ ] Root cause documented in nix-on-rocks (stop timeout, teardown ordering, or session kill)

## Related

- `~/code/sandbox/nix-on-rocks rocknix-guest-substrate`
- `docs/solutions/workflow-issues/rocknix-guest-only-nix-deploy-2026-05-27.md`
