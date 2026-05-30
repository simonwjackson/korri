---
id: task-032
title: Parameterize substrate kiosk coupling and write the product-blind invariants contract
status: To Do
priority: high
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-1-foundation
  - supersedes-027-028-030
created: 2026-05-30
source: se-work
---

# Parameterize substrate kiosk coupling and write the product-blind invariants contract

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. **Plan 003's closeout retro classified the substrate's Korri kiosk references as "soft systemd unit refs (no-op when absent)" — that classification was wrong.** Three load-bearing leaks plus an unwritten umbrella contract are best fixed as one atomic piece because they cannot ship separately without an unbuildable intermediate state.

### Leak A: hardcoded cgroup path in `guest/modules/lid.nix:115`

```sh
for candidate in \
  /sys/fs/cgroup/system.slice/korri-kiosk.service \
  /sys/fs/cgroup/system.slice/main-space-sway-kiosk.service; do
```

The lid module finds the kiosk's cgroup to SIGSTOP non-keep PIDs on lid-close. It probes for `korri-kiosk.service` first, falling back to `main-space-sway-kiosk.service`. A non-Korri product's kiosk under a different unit name silently falls back to a substrate-local profile that is not the real kiosk. The lid feature breaks silently.

### Leak B: option-tree inspection in `guest/modules/input.nix:17`

```nix
hasKorriKiosk = options.services ? korri && options.services.korri ? kiosk;
```

The substrate **reads the downstream product's NixOS option tree** to decide its own behavior — the textbook product-knowledge leak.

### Leak C: hardcoded ordering targets in `guest/modules/input.nix:44-45` and `guest/modules/session.nix:77`

```nix
before = [ "korri-compositor.service" "korri-inputd.service" ... ];
"korri-kiosk.service"
```

Substrate units order themselves before three Korri-specific unit names. A non-Korri product whose units are named differently inherits no ordering — raw gamepads are not hidden before its compositor starts.

### Leak D: positive `assertContract` calls in substrate test contracts

```nix
# nix/tests/main-space-systemd-contract.nix:31
(assertContract (contains "korri-kiosk.service" (portal.after or [ ])) "...")

# nix/tests/audio-input-systemd-contract.nix:43, :61
(assertContract (contains "korri-kiosk.service" (inputplumber.before or [ ])) "...")
(assertContract (contains "korri-kiosk.service" (thorBootstrap.before or [ ])) "...")
```

The substrate's CI **requires** these literal Korri unit names to appear in its own ordering arrays. A non-Korri product cannot pass substrate CI without naming its kiosk `korri-kiosk.service`.

### Unwritten contract

Existing `docs/contracts/` covers specific layers (10 guest-lifecycle, 11 bridge, 12 ssh, 13 modules, 14 main-space). It does **not** name "product-blind" as a contract. That gap is what let Plan 003's retro misclassify A-D as "soft references." Every PR re-derives "what counts as a leak" from scratch; the audit caught the same misclassification a substrate-followups review missed.

## Why it matters

A-D are the substrate's **load-bearing** Korri couplings — runtime behavior depends on them, not just commentary. All four failure modes are silent (no eval error, no runtime alert). Writing the invariant gives future PRs something concrete to violate and gives the lint script something to test. This is the cheapest single piece of leverage in the migration arc.

Until this lands:
- A non-Korri product silently breaks lid-close, gamepad hiding, and contract eval
- "Product-blind" remains a vibe, not an enforceable rule
- Tasks 022-026, 029, 031 have no shared spec to reference for their design defenses

## Group

**Swing 1 — Foundation.** Self-contained single-PR swing. Supersedes task-027, task-028, task-030 (all three retired when this lands).

**Must ship as one PR** because:

- Module changes (the option-tree producer) and contract tests (the consumer) cannot decompose without a red-CI intermediate state
- The invariants doc is the *spec* of the module and contract changes; landing it separately leaves the code without a defense and the spec without an implementation
- Same conceptual scope (one new option group + its callers + its written rule)

Unblocks:
- **Swing 2** (tasks 022-025) — packages can land independently but reference this swing's new option for clarity
- **Swing 3** (task 026) — fully blocked; launchers depend on knowing which unit name to start
- **Swing 4** (task 029) — fully blocked; lint cleanup uses the new negative guards this swing adds
- **Swing 5** (task 031) — fully blocked; dogfood product needs the option to override

## Acceptance Criteria

### New substrate option group

- [ ] Add a new option group (likely to `guest/modules/session.nix`, or a dedicated `guest/modules/kiosk-handoff.nix` if it grows):
  ```nix
  rocknix.session.kioskUnit = mkOption {
    type = types.nullOr types.str;
    default = "main-space-sway-kiosk.service";
    description = "systemd unit the downstream product publishes for its kiosk session. null = headless product.";
  };
  rocknix.session.compositorUnit = mkOption { ... };
  rocknix.session.inputdUnit = mkOption { ... };
  ```
  Default keeps the substrate's fallback profile working. Korri sets these to `korri-kiosk.service`, `korri-compositor.service`, `korri-inputd.service`.

### Module consumers (Leaks A-C)

- [ ] `guest/modules/lid.nix:115`: replace hardcoded `korri-kiosk.service` cgroup candidate with `config.rocknix.session.kioskUnit`. Keep fallback to the substrate's `main-space-sway-kiosk.service` only when `kioskUnit` is the substrate default.
- [ ] `guest/modules/input.nix`: delete `hasKorriKiosk` + the `options.services ? korri` inspection. Replace hardcoded `before` array with `[ config.rocknix.session.compositorUnit config.rocknix.session.inputdUnit config.rocknix.session.kioskUnit ]`, filtering out nulls.
- [ ] `guest/modules/session.nix:77`: replace hardcoded `"korri-kiosk.service"` with `config.rocknix.session.kioskUnit`.

### Contract consumers (Leak D)

- [ ] `nix/tests/main-space-systemd-contract.nix:31`: read `config.rocknix.session.kioskUnit` (or accept as test eval input) and assert against that name, not a literal.
- [ ] `nix/tests/audio-input-systemd-contract.nix:43,61`: same parameterization for both Korri-kiosk references (InputPlumber ordering, Thor sink bootstrap ordering).
- [ ] When `kioskUnit` is null/empty (headless product), contracts skip the kiosk-ordering assertion with a clear "no kiosk configured" log line — not fail.

### Korri side

- [ ] Korri's SM8550 platform composition (`nix/images/platforms/rocknix-sm8550.nix` or wherever Korri sets substrate options) sets the three new options to `korri-kiosk.service` / `korri-compositor.service` / `korri-inputd.service`.
- [ ] Default unchanged for substrate-only consumers; verify by building substrate-only image and grepping eval for the names.

### Static guards (regression lock)

- [ ] Add to `scripts/check-boundary-lint`:
  - `! grep -nE '"korri-[a-z]+\.service"' guest/modules/ guest/profiles/` (substrate no longer hardcodes Korri unit names in modules / profiles)
  - `! grep -nE 'options\.services ? korri' guest/modules/` (substrate no longer inspects Korri's option tree)
  - `! grep -nE 'assertContract.*"korri-[a-z]+\.service"' nix/tests/` (contracts no longer hardcode Korri unit names)

### The invariants document

- [ ] Create `docs/contracts/product-blind-invariants.md`. Frontmatter consistent with peer contract docs. Names seven invariants, each with: what it says, why, what counts as a violation, what enforcement exists.

- [ ] **I1: No product identifiers in substrate code.** `.nix`, `.sh`, `.patch`, `.yml` under `guest/`, `nix/`, `patches/`, `packages/`, `scripts/` must not name a downstream product except in documentation describing the substrate-product boundary.

- [ ] **I2: No option-tree inspection of downstream products.** Substrate modules must not read `options.services ? <product>` or similar to branch behavior. Behavior parameterizes through substrate-owned options.

- [ ] **I3: No positive contract assertions on product-specific literals.** Substrate `assertContract` calls must not target literal product unit names, paths, or env-var values.

- [ ] **I4: No product packages in substrate.** `packages/` contains only substrate-shape derivations.

- [ ] **I5: No product launchers in substrate.** `guest/launchers/` (if it exists) contains only substrate-generic helpers.

- [ ] **I6: No product branding assets in substrate patches.** Boot logos, splash assets, brand strings come from the payload.

- [ ] **I7: Product-payload is the only seam for product knowledge.** All product→substrate data flow goes through the payload contract or substrate-owned options.

- [ ] Each invariant lists its current regression guard (lint grep, file-presence check, content check).

- [ ] **Known outstanding violations section.** Explicit list of where the substrate currently violates each invariant today, with task references (task-021, 022-026, 029). Honest about the gap between rule and code at landing time.

### Cross-linking

- [ ] `README.md` links to the invariants doc.
- [ ] `guest/profiles/rocknix-guest-base.nix` header comment references it.
- [ ] `scripts/check-boundary-lint`'s top comment references it.

### Verification

- [ ] `nix flake check --no-build` passes:
  - With no Korri payload (substrate defaults flow): kiosk references everywhere = `main-space-sway-kiosk.service`
  - With Korri payload-shape overrides: kiosk references everywhere = `korri-kiosk.service`
  - With `kioskUnit = null` (headless): kiosk-ordering assertions skip, build succeeds
- [ ] All three new lint guards fail when seeded with a manufactured violation in a scratch worktree.
- [ ] The known-violations list in the invariants doc accurately enumerates the substrate's current state — sanity check by re-running the audit grep that surfaced this task.

## Related

- nix-on-rocks `guest/modules/lid.nix`, `guest/modules/input.nix`, `guest/modules/session.nix`
- nix-on-rocks `nix/tests/main-space-systemd-contract.nix`, `nix/tests/audio-input-systemd-contract.nix`
- nix-on-rocks `scripts/check-boundary-lint` (new guards added)
- nix-on-rocks `docs/contracts/` (peer documents the new file joins)
- task-022, 023, 024, 025, 026, 029, 031 (the violations the invariants name; downstream consumers of this swing)
- Plan 003 closeout retro (the misclassification this task corrects)
- supersedes task-027, task-028, task-030 (deleted when this lands)

## Notes

**Design questions to resolve before promoting:**

1. **Option-group shape.** Peer options under `rocknix.session.*`, or nested `rocknix.session.units = { kiosk, compositor, inputd }`? Recommendation: peer options — shorter dot-paths at every call site.

2. **`null` semantics.** Treating `kioskUnit = null` as "no kiosk at all" (headless product) is more honest than forcing the substrate to always assume a kiosk. Confirm test infrastructure supports both shapes before committing to the `nullOr` type.

3. **Parameter access in contract eval.** The contract tests evaluate under `nix flake check`. They have access to `config` if they're checks against a system configuration; they're free-standing eval helpers otherwise. Read current implementation before sizing — a 3-line read-from-config patch vs. a small test-helper refactor.

4. **Invariants doc length.** Target ~150-250 lines: each invariant is a paragraph + rule + enforcement line. Resist worked examples — those belong in plans, not contracts. Resist "future state" framing — the doc names what the substrate must enforce *today*, with violations explicitly listed.

5. **What about substrate-internal couplings?** The substrate's own fallback `main-space-sway-kiosk.service` is referenced from lid.nix's fallback branch and from contract tests. That is NOT a leak — the substrate owns that unit. Be careful to scope the lint guards to "Korri" specifically, not "any kiosk-shaped name."

6. **Sequencing inside the PR.** Suggested commit order: (1) write the invariants doc with the known-violations list, (2) introduce the new option group, (3) update modules, (4) update contracts, (5) add lint guards. Each commit is reviewable; the PR is atomic.

7. **What this is not.** Not a refactor of the substrate's systemd ordering model. Not a redesign of the kiosk handoff. Just: stop encoding the downstream product's name in load-bearing positions.

This task replaces the smaller-grained task-027 + task-028 + task-030 captured earlier; those three are retired in the same commit that lands this. The merge is purely backlog hygiene — the work is identical.

Captured from `/se-work` deep migration audit on 2026-05-30; consolidated 2026-05-30 after recognizing the three sub-items shipped as one PR by necessity.
