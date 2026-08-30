---
id: 01M1AH3RVW8PE7QJ1DSJZX0FQT
slug: reduce-repeated-zao-hitl-without-weakening-state-specific-pr
title: Reduce repeated Zao HITL without weakening state-specific proof
origin: parked
status: To Do
priority: high
labels:
  - linux-input
  - device-gate
  - hitl
  - zao
created: 2026-08-30
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri/.worktrees/feat/restore-linux-inputplumber
  branch: feat/restore-linux-inputplumber
  commit: de99db20b1a5bfe36d859096d1ce2e3f83e84d62
  repo: korri
  invoked_by: pause and make sure the backlog items knows exactly how to pick up later
---

# Reduce repeated Zao HITL without weakening state-specific proof

## Why it matters

The current device gate requires seven human stages for the temporary candidate, persistent installation, and rebooted candidate. That creates 21 confirmations and has become the main rollout cost. Several stages prove immutable binary behavior rather than installation or reboot state, but changing reuse rules can weaken assurance if done without an explicit classification and tests.

## Acceptance Criteria

- [ ] Classify each of the seven HITL stages as immutable-binary proof or state-specific proof, with a concrete reason.
- [ ] Keep one complete seven-stage temporary candidate pass bound to the exact candidate revision, fingerprint, controller, nonce, and boot.
- [ ] Keep automated gates, exact fingerprint checks, rollback proof, and reboot generation checks in every existing state.
- [ ] Require only explicitly approved state-specific HITL stages after persistent installation and reboot.
- [ ] Reject evidence reuse when the candidate store path, gate digest, controller identity, production profile, or acceptance fingerprint changes.
- [ ] Add device-gate shell tests for every revised state transition, consumed-token rule, failure, and reconcile path.
- [ ] Record explicit user approval before changing the current all-seven-stages-per-state policy.

## Related

- `services/inputd/deploy/device-check.sh`
- `services/inputd/deploy/test-device-check.sh`
- `services/inputd/deploy/README.md`
- `work/items/active/019fde6b-8c02-7b01-8dfb-ffe97bcb5ef1-restore-linux-inputplumber/work.md`

## Notes

Discovered after candidate v25 was paused. The existing policy remains binding until this item is explicitly promoted and approved.
