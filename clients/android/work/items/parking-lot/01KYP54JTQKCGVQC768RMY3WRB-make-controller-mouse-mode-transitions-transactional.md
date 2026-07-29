---
id: 01KYP54JTQKCGVQC768RMY3WRB
slug: make-controller-mouse-mode-transitions-transactional
title: Make controller mouse-mode transitions transactional
origin: parked
status: To Do
priority: medium
labels:
  - input
  - controller
  - mouse-emulation
  - bug
created: 2026-07-29
source: se-code-review
context:
  cwd: /home/simonwjackson/code/sandbox/artemis
  branch: spike/korri-shell-webview
  commit: 3b81cf1514b1
  repo: artemis
  invoked_by: Tier-2 focused re-review
---

# Make controller mouse-mode transitions transactional

## Why it matters

Focused adversarial review exposed a pre-existing state-transition trap: disabling controller mouse emulation while inputs are held can strand emulated mouse buttons or reinterpret held buttons, repeat events, hat axes, sticks, and aggregated default-context input as gamepad input. A one-shot local mask is insufficient and risks introducing new stuck-input paths.

## Acceptance Criteria

- [ ] Disabling mouse emulation releases any emulated mouse buttons that are logically down.
- [ ] Inputs consumed by mouse mode are not forwarded as gamepad input until each source reaches a neutral/released state.
- [ ] Suppression covers key repeats, D-pad hat axes, analog sticks, USB/input-device aggregation, and default/on-screen controller context.
- [ ] Re-enabling starts from reset transient state, including last input map, X movement mode, and speed multiplier.
- [ ] Focused tests cover held A/B, D-pad repeats/hat state, tilted sticks, multiple aggregated contexts, and normal neutral toggle-off.

## Related

- `app/src/main/java/com/limelight/binding/input/ControllerHandler.java`
- `work/items/active/20260728-korri-dead-code-demolition/plan.md`

## Notes

A partial cleanup was attempted during demolition review and deliberately reverted after reviewers demonstrated repeat, axis, and aggregation bypasses. The shipped demolition only keeps already-active emulation toggleable off after its live preference is disabled.
