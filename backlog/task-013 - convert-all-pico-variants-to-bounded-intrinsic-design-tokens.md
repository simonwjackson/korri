---
id: task-013
title: Convert all pico variants to bounded intrinsic-design tokens (no raw cqh/cqw leaves)
status: To Do
priority: medium
labels:
  - prototype
  - design-system
  - intrinsic-design
  - pico
created: 2026-06-18
source: user
---

# Convert all pico variants to bounded intrinsic-design tokens (no raw cqh/cqw leaves)

## Why it matters

The "cart is humongous on TV" bug exposed a systemic leak: raw, unbounded `cqh`/`cqw` values scale linearly with the screen, while the type scale is clamped (caps at `--pico-base-max`). On large lean-back screens the clamped text plateaus but raw-unit elements keep growing, so proportions drift and elements run away. Game Detail (variant D) was fixed by deriving the cart from `--pico-base` (so it shares the type ceiling, and the MAX knob became the scale-up-vs-cap A↔B dial), but Home (A cartridge shelf), Browse (C icon grid), and In-Game (E) almost certainly still carry raw `cqh`/`cqw` art/structure leaves. Until every variant derives from the generators, the whole theme will not respond consistently to MAX/BASE/RATIO, and the intrinsic-design methodology (few generators, bounded scale, no raw leaves) is only half-applied.

## Acceptance Criteria

- [ ] No raw cqh/cqw font-size or art-size leaves remain in pico-prototype.css — every size derives from --pico-text-*/--pico-space-* or is bounded by min(Ncqh, calc(var(--pico-base) * k))
- [ ] Home (A) cartridge-shelf carts and Browse (C) icon-grid carts are bounded by --pico-base so they share the type scale's ceiling
- [ ] Dragging the MAX generator knob flips A (scaled-up) <-> B (capped + whitespace) consistently across ALL pages, not just Game Detail
- [ ] A/B character decision is made and the settled MAX (plus other generator defaults) is exported from the lab and baked into the CSS fallbacks + PICO_KNOBS/PICO_DEVICES seeds
- [ ] Structural cqw insets that should track the device (e.g. horizontal page padding) are reviewed and either kept intentionally or converted to --pico-space-* tokens

## Related

- `product/apps/portal/prototypes/pico/pico-prototype.css`
- `product/apps/portal/prototypes/pico/device-lab/AGENTS.md`
- `product/apps/portal/prototypes/pico/NOTES.md`
- `product/apps/portal/prototypes/pico/VariantCartridgeShelf.tsx`
- `product/apps/portal/prototypes/pico/VariantIconGrid.tsx`

## Notes

Mechanism reference (from D): cart = `min(74cqh, calc(var(--pico-base) * 12))`; base = `round(clamp(var(--pico-base-min,8px), calc(var(--pico-base-cqi,2.5) * 1cqi), var(--pico-base-max,22px)), 1px)`. Because cart + text both derive from --pico-base, MAX (--pico-base-max) is the shared ceiling: low = plateau/whitespace (B), high = scale-up (A). Tailwind v4 port already de-risked (device-lab/spike). Verified A/B live on Game Detail: cart heights 132/264/312 (A, MAX 200) vs 132/216/216 (B, MAX 18) across handheld/THOR/ODIN.
