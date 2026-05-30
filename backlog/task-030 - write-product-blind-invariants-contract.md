---
id: task-030
title: Write docs/contracts/product-blind-invariants.md naming the substrate's product-blind rules
status: To Do
priority: high
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - documentation
  - swing-1-foundation
created: 2026-05-30
source: se-work
---

# Write `docs/contracts/product-blind-invariants.md` naming the substrate's product-blind rules

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. Existing nix-on-rocks `docs/contracts/` covers specific layers (`layer10-guest-lifecycle`, `layer11-bridge`, `layer12-guest-ssh`, `layer13-modules`, `layer14-main-space`, etc.) but **does not name "product-blind" as a contract**. It is currently an implicit shared understanding among recent plans.

Without a written invariant, every future PR re-derives "what counts as a product-knowledge leak?" from scratch. The deep audit found that this re-derivation was already wrong once — Plan 003's closeout retro classified semantic leaks (cgroup paths, option-tree inspection, positive contract assertions) as "soft references" because no document said otherwise.

A written invariant gives future PRs something to violate (and gives the lint script something to test). Without it, "product-blind" remains a vibe.

## Why it matters

This is the cheapest single piece of leverage in the entire migration. Writing the invariant unblocks:

- Reviewer confidence (something concrete to point at when a PR introduces a leak)
- task-027 / task-028's design defense (the cgroup / option-tree / contract leaks are violations of an explicit rule, not stylistic preferences)
- task-029's lint rewrite (the negative guards are the executable form of the invariant)
- task-031's dogfood test (the second product is the executable form of the contract)
- Future product authorities (something to read on day 1)

Until it lands, every product-blindness discussion restarts from zero.

## Group

**Swing 1 — Foundation** (with task-027 module parameterization, task-028 contract assertion params). Lands as one PR with the foundational module/contract changes because:

- The invariant is the *spec* of what task-027 and task-028 implement.
- Without the invariant, task-027 / task-028's reasoning is "we think these are leaks." With it, they're "these violate <invariant>."
- It's a small file. Including it in Swing 1 adds no risk.

If absolutely necessary, it can land standalone first as a docs-only PR, then Swings 1 task-027 / task-028 follow. But the natural shape is one PR.

## Acceptance Criteria

### Create the document

- [ ] `docs/contracts/product-blind-invariants.md` exists.
- [ ] Frontmatter (id, status) consistent with peer contract docs.
- [ ] Names the invariants below, each with: what it says, why, what counts as a violation, what enforcement currently exists.

### Invariants to name

- [ ] **I1: No product identifiers in substrate code.** Substrate `.nix`, `.sh`, `.patch`, `.yml` under `guest/`, `nix/`, `patches/`, `packages/`, `scripts/` must not name a downstream product (e.g. "Korri", `services.korri.*`, `korri-*.service`) except in documentation that describes the substrate-product boundary.
- [ ] **I2: No option-tree inspection of downstream products.** Substrate modules must not read `options.services ? <product>` or similar to branch behavior. Behavior parameterizes through substrate-owned options that downstream products set.
- [ ] **I3: No positive contract assertions on product-specific literals.** Substrate eval contracts must not `assertContract` against literal product unit names, paths, or env-var values. Contracts parameterize.
- [ ] **I4: No product packages in substrate.** `packages/` contains only substrate-shape derivations (kernel modules, hardware bridges, generic capabilities). Product game/runtime/client packages live with the product.
- [ ] **I5: No product launchers in substrate.** `guest/launchers/` (if it exists) contains only substrate-shape helpers. Product-specific launchers live with the product.
- [ ] **I6: No product branding assets in substrate patches.** Boot logos, splash assets, color palettes, brand strings come from the payload, not patches.
- [ ] **I7: Product-payload is the only seam for product knowledge.** Any data flow from product to substrate at build/runtime goes through the product-payload contract or substrate-owned options.

### Document the enforcement table

- [ ] For each invariant, name the regression guard:
  - I1: `scripts/check-boundary-lint` negative-grep guards
  - I2: same (extend with grep for `options.services ?`)
  - I3: same (extend with grep for `assertContract.*"[a-z]+-kiosk\.service"`)
  - I4: file-presence check (`packages/<product>` should not exist for non-substrate-generic packages)
  - I5: file-presence check (`guest/launchers/` is empty or substrate-generic only)
  - I6: content check on `patches/rocknix/*.patch` for product-brand strings
  - I7: covered by I1-I6 collectively; a positive assertion that the payload contract is the only declared substrate→product interface

### Verification

- [ ] All seven invariants currently violated by `origin/main` are explicitly listed in the document as **known outstanding violations** with their task-XXX references (task-021, 022, 023, 024, 025, 026, 027). The document is honest about the gap between the rule and the current code.

## Related

- nix-on-rocks `docs/contracts/` (peer documents)
- task-021 through task-029 (the violations the invariants name)
- task-031 (the dogfood test that validates the invariants are enforced)
- Plan 003 closeout retro (the post-mortem this document codifies)

## Notes

**Design questions to resolve before promoting:**

1. **One umbrella doc, or layered?** Layered (one invariant per file) is verbose; umbrella (this task's shape) is denser. Recommendation: umbrella because the invariants are mutually reinforcing — naming them together makes the system coherent.

2. **Length.** Aim for ~150-250 lines. Each invariant is a paragraph + a rule + an enforcement line. Resist worked examples for now — they belong in plans, not contracts.

3. **Cross-link.** Link this doc from `README.md`, `guest/profiles/rocknix-guest-base.nix` header comment, and `scripts/check-boundary-lint`'s top comment so it's discoverable from the substrate's load-bearing files.

4. **What happens when an invariant is violated.** Be explicit: the regression guards fail PR CI; the violation either gets fixed, the invariant explicitly amended (with rationale in the PR description), or the substrate's product-blind claim narrows. No silent waivers.

Captured from `/se-work` deep migration audit on 2026-05-30.
