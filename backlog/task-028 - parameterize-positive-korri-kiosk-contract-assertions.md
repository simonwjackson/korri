---
id: task-028
title: Parameterize the positive korri-kiosk.service assertions in substrate contracts
status: To Do
priority: high
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-1-foundation
created: 2026-05-30
source: se-work
---

# Parameterize the positive `korri-kiosk.service` assertions in substrate contracts

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. Two substrate contract tests **positively assert** ordering against the Korri kiosk unit by literal name:

```nix
# nix/tests/main-space-systemd-contract.nix:31
(assertContract (contains "korri-kiosk.service" (portal.after or [ ])) "Portal bootstrap can follow downstream Korri kiosk")

# nix/tests/audio-input-systemd-contract.nix:43
(assertContract (contains "korri-kiosk.service" (inputplumber.before or [ ])) "InputPlumber starts before downstream Korri kiosk")

# nix/tests/audio-input-systemd-contract.nix:61
(assertContract (contains "korri-kiosk.service" (thorBootstrap.before or [ ])) "Thor sink bootstrap orders before downstream Korri kiosk")
```

These are not commentary or fallback hints — they are positive `assertContract` checks. The substrate's CI **requires** these specific Korri unit names to appear in its own ordering arrays. A non-Korri product cannot pass substrate CI without naming its kiosk `korri-kiosk.service`.

## Why it matters

This is the contract layer of the same leak that task-027 fixes in modules. The substrate's evaluation contracts (its CI-gate spec for "what shape must the systemd graph have") encode "Korri" by literal name. Until parameterized, the substrate's contract tests are themselves product-aware, and CI green for a non-Korri product would require either:

- forging a `korri-kiosk.service` unit on a non-Korri product (silly), or
- skipping these contracts (which breaks the substrate's own coverage)

Both are non-options. The contracts must parameterize.

## Group

**Swing 1 — Foundation** (with task-027 module parameterization, task-030 invariants doc). Must land as one PR. See task-027's Group section.

This task ships in the same PR as task-027 because:
- The new `rocknix.session.kioskUnit` option introduced by task-027 is the input to these contracts.
- Module changes without contract updates fail CI; contract updates without module changes are vacuous.
- Splitting them is unsafe.

## Acceptance Criteria

### Read the parameter

- [ ] `nix/tests/main-space-systemd-contract.nix` reads the test eval's `config.rocknix.session.kioskUnit` (or accepts it as an argument) and asserts against that name, not a literal.
- [ ] `nix/tests/audio-input-systemd-contract.nix` does the same for both Korri-kiosk references (InputPlumber ordering, Thor bootstrap ordering).

### Default behavior

- [ ] With no Korri payload, the contracts evaluate against `main-space-sway-kiosk.service` (the substrate default per task-027) and pass.
- [ ] With Korri's payload-shape overrides, they evaluate against `korri-kiosk.service` and pass.
- [ ] If the option is set to `null` or empty (headless product per task-027's design call), the contracts skip the kiosk-ordering assertion entirely with a clear "no kiosk configured" log line.

### Negative guard

- [ ] Grep for `"korri-kiosk\.service"` (or any `"korri-[a-z]+\.service"`) under `nix/tests/` returns nothing. Negative assertion.

### Verification

- [ ] `nix flake check --no-build` passes both with and without a simulated Korri payload (the substrate's existing test infrastructure supports this — confirm before scoping).

## Related

- nix-on-rocks `nix/tests/main-space-systemd-contract.nix`
- nix-on-rocks `nix/tests/audio-input-systemd-contract.nix`
- task-027: introduces the option this task reads
- task-030: writes the umbrella invariant

## Notes

**Design questions to resolve before promoting:**

1. **Parameter access in test eval.** The contract tests are evaluated under `nix flake check`'s eval context. They have access to `config` if they're checks against a system configuration, or they're free-standing eval helpers. Check current implementation — it determines whether this task is a 3-line patch (reading `config.rocknix.session.kioskUnit`) or a small refactor (threading the parameter through a test helper).

2. **Coverage when payload is absent.** If a substrate-only build sets `rocknix.session.kioskUnit` to its fallback, the existing assertions just re-aim at the fallback name and still pass. That's the cleanest outcome — same coverage shape, different literal under the hood.

3. **Coverage when kioskUnit is null/empty (headless).** Decide: skip the assertion, or assert that ordering arrays contain no kiosk references? Recommendation: skip with a log line, because asserting absence of references is harder to write robustly than asserting presence.

Captured from `/se-work` deep migration audit on 2026-05-30.
