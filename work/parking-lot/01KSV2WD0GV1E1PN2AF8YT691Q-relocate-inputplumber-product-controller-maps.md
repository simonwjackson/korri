---
id: 01KSV2WD0GV1E1PN2AF8YT691Q
slug: relocate-inputplumber-product-controller-maps
title: "Relocate inputplumber's product-specific controller maps out of the substrate"
origin: parked
legacy: task-025
status: In Progress
priority: low
labels:
  - follow-up
  - nix-on-rocks
  - product-blind
  - sm8550
  - swing-2-packages
  - needs-design
created: 2026-05-30
source: se-work
---

# Relocate inputplumber's product-specific controller maps out of the substrate

## Context

Surfaced 2026-05-30 by the deep substrate-leak audit. `packages/inputplumber/default.nix` is **explicit** about the problem in its own comments:

> *"The controller maps copied below (Ayn MCU, Ayaneo MCU) are per-product/per-MCU, not per-SoC — inputplumber selects them at runtime via hardware detection."*

The package as a whole is reasonable substrate material — InputPlumber bridges raw evdev to virtualized controllers, which is a generic SM8550 capability. But the bundled YAML maps under `packages/inputplumber/maps/` are per-MCU:

- `maps/capability_maps/ayaneo_mcu_japanese.yaml`
- `maps/capability_maps/ayaneo_mcu_xbox.yaml`
- `maps/capability_maps/ayn_mcu.yaml`
- `maps/devices/01-ayaneo-controller-japanese.yaml`
- `maps/devices/01-ayaneo-controller.yaml`
- `maps/devices/02-ayn-controller.yaml`

These maps describe AYANEO and AYN handheld controllers. Both are products that Korri ships against (Odin2Portal is AYN, Thor is AYANEO-adjacent). A non-Korri product running on, say, an Acme SM8550 handheld would carry these dead-weight maps with no benefit.

## Why it matters

Lower-impact than tasks 022-024 because the maps are runtime-selected by hardware detection — extra maps are not actively harmful. But the substrate's "product-blind" claim becomes "product-blind except for a small grab-bag of handheld controller maps" which is harder to defend long-term. Splitting the maps lets each product authority ship only what it needs and lets future products land their own maps without touching the substrate.

## Group

**Swing 2 — Package migration** (with task-022 steam, task-023 cemu, task-024 moonlight-embedded). Most coupled of the four because the question "split the package or relocate the whole thing" is genuinely undecided — see Notes.

If the decision is "split", this task ships a smaller change than 022-024 (some YAML files move, the package stays). If the decision is "move whole", it's the same shape as the others.

## Acceptance Criteria

### Decision recorded first

- [ ] Notes question 1 (split vs. move whole) resolved and recorded in the PR description.

### If split (recommended)

- [ ] `packages/inputplumber/default.nix` stays in the substrate (generic InputPlumber binary + udev rules).
- [ ] All `packages/inputplumber/maps/` files move to Korri (e.g. `korri/products/<product>/inputplumber-maps/`).
- [ ] The substrate's `guest/modules/input.nix` (or wherever InputPlumber is wired) loads maps from a payload-supplied path, not a substrate-baked one. This needs a new payload-contract field for "additional inputplumber maps path."
- [ ] `services.inputplumber` continues to start; runtime hardware-detection picks up Korri's maps from the payload path.

### If move whole

- [ ] Same shape as task-022/023/024: package gone from substrate, lives in Korri.
- [ ] Substrate gains no InputPlumber at all by default; any product that wants it ships its own.

### Either path

- [ ] `verify-product-payload --product odin2portal` and `--product thor` pass.
- [ ] Controller-map smoke on sobo (a controller produces the expected virtual events) still passes.

## Related

- nix-on-rocks `packages/inputplumber/` (whole tree, especially `maps/`)
- nix-on-rocks `guest/modules/input.nix` (consumer of the package)
- product-payload contract (extension point if split is chosen)
- task-022, task-023, task-024: peer Swing-2 items

## Notes

**Design questions to resolve before promoting:**

1. **Split or move whole?** The package itself is hardware-bridge code (generic). The maps are product-specific (per-MCU). Cleanest seam: split — substrate ships the bridge, payload ships the maps. But that requires a new payload-contract field for "inputplumber maps directory" and slightly more wiring than "move the whole thing to Korri." Recommendation: split, because the InputPlumber binary genuinely is substrate-shaped and forcing every product to vendor its own InputPlumber build is wasted work.

2. **Map authority over time.** If split, who owns adding a new product's controller map? In the split world, each product owns its own under its payload. In the move-whole world, every product owns its own InputPlumber package and chooses its own maps. Split is lower-friction for adding products.

3. **Coupling with task-032.** task-032 introduces a generalized substrate-option pattern (`rocknix.session.kioskUnit`). A similar pattern (`rocknix.inputplumber.extraMapsPath`?) might fit naturally. Worth checking after task-032 lands.

4. **This is the lowest-priority Swing-2 item.** It can be deferred past Swings 1-4 without blocking anything else. If the design question is too slow to resolve, peel this off Swing 2 and ship the other three.

Captured from `/se-work` deep migration audit on 2026-05-30.

2026-06-01 challenge-plan update: the design decision changed from both original options. Do **not** move AYN/AYANEO physical controller maps into Korri. Revised ownership is: Korri owns the InputPlumber runtime package and normalized-input product contract; nix-on-rocks owns SM8550/handheld controller maps as hardware data and exposes them through a named data-only output such as `inputplumber-sm8550-maps` with `$out/share/inputplumber/...`. Korri composes its runtime package with that maps output in `nix/images/platforms/rocknix-sm8550.nix`, prefers `XDG_DATA_DIRS` multi-root loading, fails SM8550 eval when the maps output is missing, and closes this task only after Sobo/Odin smoke validates the split.
