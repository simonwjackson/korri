---
id: task-021
title: Move boot-logo ownership from the nix-on-rocks substrate to Korri
status: To Do
priority: medium
labels:
  - follow-up
  - nix-on-rocks
  - korri
  - product-payload
  - sm8550
  - branding
created: 2026-05-30
source: se-work
---

# Move boot-logo ownership from the nix-on-rocks substrate to Korri

## Context

The substrate-to-product inversion (nix-on-rocks PR #1 + Korri PR #2 + the substrate-followups closeout) made `nix-on-rocks` product-blind for module options, build outputs, locks, and most static checks. **It did not address the boot logo.**

Today `patches/rocknix/0003-sm8550-device-and-host-config.patch` (on nix-on-rocks `main`) patches `projects/ROCKNIX/packages/tools/rocknix-splash/patches/rocknix-splash-0001-use-custom-boot-logo.patch` with **Korri-shaped branding**: the SVG path data renders the Korri wordmark and the color palette is the Korri green/white (`rgb(126,253,59)`, `rgb(133,244,77)`, `rgb(253,253,253)`), replacing the upstream ROCKNIX red/gray. This is the same kind of product-knowledge leak the substrate inversion eliminated everywhere else — substrate code shouldn't know what brand the device ships under.

Several plans flagged this as deferred when the payload contract was first designed:

- nix-on-rocks `docs/plans/2026-05-26-001-refactor-product-payload-contract-plan.md:47`: "Later customization: add boot logo, product metadata, Moonlight defaults, and other payload assets once the generic seam is active."
- nix-on-rocks `docs/plans/2026-05-26-002-refactor-product-payload-image-consumption-plan.md:48`: "Later customization: add boot logo, splash/branding assets..."
- korri `docs/plans/2026-05-26-002-refactor-rocknix-product-payload-emission-plan.md:57`: same.

The seam was named in three plans, never built, and never captured as a backlog item. Surfaced 2026-05-30 closing out the substrate-followups arc.

## Why it matters

This is the last visible Korri-knowledge leak in the substrate. Until it lands:

- A non-Korri product authority cannot ship a different boot logo without forking `0003-sm8550-device-and-host-config.patch`.
- The substrate's "product-blind" claim is materially false at boot time — the very first thing a user sees is Korri branding regardless of which payload is selected.
- The patch series carries product-shaped asset data that has to be rebased every time the substrate moves.

## Acceptance Criteria

### Substrate side (nix-on-rocks)

- [ ] Extend the product-payload contract with a branding asset seam. Smallest viable shape: a single optional payload-supplied file path (e.g. `<payload>/branding/boot-logo.c`) that the substrate splices into `rocknix-splash`'s `main.c` at build time. Document the contract in `docs/contracts/`.
- [ ] Rewrite the splash hunk in `patches/rocknix/0003-sm8550-device-and-host-config.patch` so the patched `rocknix-splash-0001-use-custom-boot-logo.patch` carries **upstream-faithful** SVG/colors (or a substrate-default neutral placeholder), not Korri-shaped data. The branding overlay comes from the payload at image-assembly time.
- [ ] Add a substrate static check that asserts (a) no Korri-specific strings/colors appear in the splash patch and (b) the payload-overlay path is wired through the image-build step. Add to `guest/scripts/static-checks.sh` or `tests/guest-substrate-static-checks.sh` depending on whether the assertion is path-level or content-level.
- [ ] `verify-product-payload --product odin2portal` and `--product thor` continue to pass with the branding asset both present and absent (absent → substrate-default; present → Korri logo).

### Korri side

- [ ] Add the Korri SVG path data + green/white color palette as a payload asset under the existing `korri-rocknix-kiosk-{odin2portal,thor}` payload outputs. The asset's final form is whatever shape the substrate contract above accepts (likely a small generated `.c` fragment that the substrate splices in).
- [ ] Update `nix/images/platforms/rocknix-sm8550.nix` (or wherever payload emission is wired) to include the branding asset in the payload tar.
- [ ] `nix/tests/korri-rocknix-sm8550-config-check.nix` (or a peer check) asserts the branding asset is present in the emitted payload.

### Acceptance

- [ ] Build a Korri SM8550 image (Odin2Portal lane first, Thor second) via `build-image-only.yml`, flash to sobo, confirm the boot splash shows the Korri logo (not the substrate-default placeholder).
- [ ] Build a substrate-only image without a Korri payload (or with a synthesized "no-branding" payload), confirm the boot splash shows the substrate default and not Korri colors. This is the negative test that proves the leak is closed.
- [ ] Record acceptance under `docs/acceptance/sm8550-payload-owned-boot-logo-sobo-YYYY-MM-DD.md` in nix-on-rocks.

## Related

- nix-on-rocks `patches/rocknix/0003-sm8550-device-and-host-config.patch` (lines ~240-330: splash hunk with Korri SVG/colors)
- nix-on-rocks `docs/plans/2026-05-26-001-refactor-product-payload-contract-plan.md`
- nix-on-rocks `docs/plans/2026-05-26-002-refactor-product-payload-image-consumption-plan.md`
- korri `docs/plans/2026-05-26-002-refactor-rocknix-product-payload-emission-plan.md`
- task-001 (U4 moonlight module removal): adjacent product-blindness work
- substrate-followups PR (merged 2026-05-30 as `937fa2e`): closed out everything *except* this

## Notes

**Design questions to resolve before promoting:**

1. **Asset shape.** The simplest substrate contract is "payload provides a drop-in C fragment we splice into `main.c`." That keeps the substrate's render path unchanged but couples the payload to ROCKNIX's renderer implementation. Alternative: payload provides an SVG file and substrate ships a small SVG→C transcoder. SVG is cleaner but adds tooling.

2. **Substrate default.** When no payload-supplied logo is present, does substrate render (a) upstream ROCKNIX red/gray, (b) a neutral monogram, or (c) refuse to build until the payload provides one? Option (c) is the strictest seam check; option (a) is the lowest-friction default for substrate-only consumers.

3. **Where Korri's SVG actually lives.** Today the data is inline in the 0003 patch. It should move to a Korri source file — most natural is `nix/images/platforms/rocknix-sm8550-branding/boot-logo.c` (or `.svg`) so the asset is in the diff next to the rest of the SM8550 payload composition.

4. **Pairing with task-001.** task-001 (U4 moonlight module removal) is the other open product-blindness follow-up. Both touch `patches/rocknix/0003-sm8550-device-and-host-config.patch` indirectly — moonlight is a separate module file but lives in the same substrate. Worth deciding whether to ship them in one PR (smaller surface, single CI cycle) or two (cleaner review threads).

5. **What this is not.** Not a logo redesign. Not a payload-format rewrite. The asset content stays the same Korri SVG; only its location of authority changes.

This is small-to-medium PR territory in both repos. Substrate side is the harder half because the contract shape decision drives the patch-rewrite work. Promote to `se-plan` (not `se-work`) when picked up, because the contract shape question is genuine.

Captured from `/se-work` session on 2026-05-30 closing out the substrate-followups arc.
