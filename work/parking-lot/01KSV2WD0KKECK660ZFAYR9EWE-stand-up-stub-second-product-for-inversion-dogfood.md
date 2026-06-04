---
id: 01KSV2WD0KKECK660ZFAYR9EWE
slug: stand-up-stub-second-product-for-inversion-dogfood
title: Stand up a stub second product to dogfood the product-blind substrate inversion
origin: parked
legacy: task-031
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - dogfood
  - swing-5-dogfood
created: 2026-05-30
source: se-work
---

# Stand up a stub second product to dogfood the product-blind substrate inversion

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. The entire inversion arc — phases 1-5, the SM8550 capability boundary, the substrate-followups closeout — rests on a single claim: **a non-Korri product can consume the nix-on-rocks substrate.**

That claim has never been tested. There is no second product, no stub, no dogfood. Every demonstration that the substrate is "product-blind" is currently a thought experiment ratified by code review.

The deep audit found that the claim is, in fact, materially false today (tasks 021-029 enumerate the violations). Even after those Swings land, the claim will be **probably true based on absence of obvious leaks** — not **proven by an existence test**.

A stub second product makes the difference between "we think this works" and "this works." It is the actual proof.

## Why it matters

- **Surface the leaks Swings 1-4 missed.** Building a second product against the substrate will surface every assumption no audit caught. There is no substitute for actually running the code.
- **Lock the seam.** Once a second product exists in CI, future leaks fail CI for that product, not just lint. The substrate's product-blindness becomes load-bearing rather than aspirational.
- **Onboarding.** A stub product is the best possible documentation for "how do I bring a new product against this substrate." Currently that documentation is the entire Korri repository.
- **Future-proofing.** The substrate's value over the long run is "supports multiple products." Zero products other than Korri means that value is hypothetical.

## Group

**Swing 5 — Dogfood** (single-task swing). The final swing because:

- It depends on Swings 1-4 in the sense that an honest dogfood needs the seam to actually exist (otherwise the stub product just re-vendors Korri's substrate leaks).
- It is the only swing whose success is *measured externally* — does it build? does it boot? does it serve as a non-trivial existence proof?
- It is the largest single piece of work in the arc.

## Acceptance Criteria

### Minimum viable stub

- [ ] A new repo (or worktree, see Notes) exists named `nix-on-rocks-demo-product` or similar, that:
  - Imports `nix-on-rocks` as a flake input
  - Sets `rocknix.session.kioskUnit`, `rocknix.session.compositorUnit`, `rocknix.session.inputdUnit` (from task-032) to demo-product-shape names
  - Ships a single trivial NixOS module that defines those units as "hello world" services (e.g. systemd one-shots that log "demo-product kiosk start" to journal)
  - Emits a product payload with the substrate's contract: a minimal `product-payload-demo.lock`, a payload tar with just the required fields, and a boot-logo asset (a neutral monogram, no Korri branding)

### Build proof

- [ ] `nix build .#image-sm8550-demo-product` produces an SM8550 image artifact.
- [ ] No part of the substrate eval references Korri when this product is the consumer (grep the eval output / build log for `korri` returns nothing).

### Boot proof

- [ ] Flash the demo image to one SM8550 device (sobo or any spare).
- [ ] Device boots to the demo-product "kiosk" (the hello-world systemd unit appears in journal).
- [ ] Boot splash shows the neutral demo logo, not Korri colors.
- [ ] No journalctl errors mention Korri-specific units, options, or paths.

### CI lock

- [ ] Add a nix-on-rocks CI workflow `build-image-demo-product.yml` that builds the demo-product image on every PR. This is the CI lock: a substrate PR that breaks the demo-product seam fails CI.
- [ ] Acceptance recorded under `docs/acceptance/sm8550-demo-product-dogfood-YYYY-MM-DD.md` in nix-on-rocks.

### Documentation

- [ ] `docs/contracts/product-blind-invariants.md` (introduced by task-032) updates its enforcement table to point at the demo-product CI as the existence-proof enforcer of the invariants.
- [ ] A short `docs/onboarding/bringing-a-new-product.md` (or similar) points future product authorities at the demo-product as the canonical "minimal product" example.

## Related

- Every other task in this audit (021-030) — this is the integration test for all of them
- nix-on-rocks `flake.nix` (consumer of the demo-product, if it's in-tree)
- task-032 (option group + invariants doc this task validates)

## Notes

**Design questions to resolve before promoting:**

1. **In-tree or separate repo?** Two paths:
   - **In-tree**: `nix-on-rocks/demos/demo-product/` shipped inside the substrate repo. Pros: no second-repo overhead, CI is automatic, easy to keep in sync. Cons: a "product inside the substrate" is itself a small product-blindness lie, and the substrate would have to ship a `packages.image-demo-product` it doesn't actually use.
   - **Separate repo**: `nix-on-rocks-demo-product` as a satellite. Pros: clean separation, honest about the substrate-as-input pattern. Cons: a second repo to maintain, the CI lock requires cross-repo workflow plumbing.
   - **Recommendation**: in-tree under `demos/` for the first iteration; promote to a satellite repo only if it grows beyond ~5 files. The cost of a separate repo for a stub is real; the cost of in-tree lock-as-existence-proof is small.

2. **How "stub" is "stub"?** Minimum useful: hello-world systemd unit + neutral boot logo + payload lock. Beyond minimum: a launcher that runs `cowsay`, a fake "game library" that opens a single binary. Recommendation: hello-world only for v1; expand only if a real seam edge case demands it.

3. **Which SM8550 device for boot test?** Sobo is convenient but is Korri's primary device. Using sobo for the dogfood test risks confusing Korri / demo-product state on the same hardware. Recommendation: use sobo with a clear reset between Korri and demo flashes, *or* keep this test build-and-VM-only and defer device boot to a spare SM8550 if/when one shows up.

4. **What about all the substrate's existing test contracts?** They evaluate against any consumer that imports the profile. The demo-product runs them. If task-032 didn't fully parameterize and contracts still hardcode Korri names, those contracts fail for the demo-product — surfacing the violation that the audit might have missed.

5. **Naming.** "demo-product", "blank-product", "noop-product", "sample-product". Recommendation: `sample-product` — it suggests the canonical template for new products without being self-deprecating about the work.

Captured from `/se-work` deep migration audit on 2026-05-30.
