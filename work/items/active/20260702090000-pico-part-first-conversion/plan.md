---
title: Pico part-first conversion (the Shift treatment)
status: completed
created: 2026-07-02
---

# Pico part-first conversion

Give the pico surface the same **part-first** treatment Shift received. Pico is
no longer a throwaway prototype — it is a real target.

## Starting position (what pico already has)

Pico is **already atomically decomposed** — arguably more completely than Shift
was. It ships a full `ui/atoms | molecules | organisms | templates` hierarchy
(14 atoms, ~15 molecules, ~60 organisms, 3 templates), each with a `.tsx` +
`.part.tsx` + `.story.tsx`, and ~74 pages compose those parts. So the
atom-floor / atomic-ladder work is **done**; this conversion is the *other*
Shift thrust — the **part-first architecture**.

Pico's lab adapter (`tools/theme-workshop/lab/adapters/pico.ts`) currently:
- mounts only 2 real screens (Home cartridge shelf + Game Detail),
- has one `Data` axis (`pico-axes.tsx`),
- has **no** part registry root, **no** part-level edges, **no**
  device-as-composition, **no** design-parts tags, **no** live device facts
  (the status bar hardcodes `10:24` / `82%` / a static wifi glyph).

## What "part-first" means (the invariants to reach)

Mirror the realized Shift architecture:

1. **One drive mechanism.** Placed parts mount through the real scoped registry
   via a `PicoPartSurface` root (no router), the same provider stack a live
   device gets — so a part reads the production atoms.
2. **Edges belong to parts**, keyed by story (`surfacePartInputs` /
   `surfacePartEvents`), not to screens.
3. **Device is a composition.** A live device inherits its edges from the page
   part its screen composes (shared `deviceEventsForScreen` /
   `deviceInputsForScreen`, route→page-part via a stable `pagePartId`), dropping
   inputs an axis already covers.
4. **Device facts flow through production derivation** (`deviceStateAtom` →
   pico display state → props), never hand-set props.
5. **Every part is pick-selectable** via `data-korri-part/layer/name` tags from
   a single registry (`PICO_DESIGN_PARTS`).
6. Binding edits re-seed via per-pair `reseedKeys`; render-vs-capture
   separation preserved.

## Reused shared infra (no rebuild)

`tools/theme-workshop/lab/model/lab-part-edges.ts` (`partEventsForStory`,
`partInputsForStory`, `pagePartStoryForScreen`, `deviceEventsForScreen`,
`deviceInputsForScreen`, `emitScopedEvent`); `part-mount/LabPartMount.tsx`;
`model/lab-surface-registries.ts` (`eachLabTargetRegistry`,
`clearLabSurfaceRegistries`); the device-state foundation
`product/platform/react/device/device-atoms.ts` (`deviceStateAtom`). The
`LabSurfaceAdapter` type already exposes every part-first field
(`partRegistryRoot`, `surfacePartMount`, `renderSurfacePart`,
`surfacePartInputs`, `surfacePartEvents`, `sources`, `pagePartId`,
`makeSeedInitialValuesForBinding`).

## Scope pivot (2026-07-02)

User: pico is no longer throwaway; the standalone prototype gallery is dropped;
go 100% device lab; salvage anything not already represented. **Finding:** there
is no separate gallery route — pico already lives entirely in the device lab
(theme-workshop). All ~74 screens are surfaced as page-layer stories via
`config.tsx`; every kit part is discovered via `*.part.tsx`. So everything is
already represented; nothing to bring over. Retired the throwaway apparatus
(deleted unused `PicoPrototypeSwitcher`, rewrote `NOTES.md`, stripped 274
'PROTOTYPE — Throwaway' labels). This makes the P3 gallery-default question moot:
device facts are driven in the lab like Shift.

## Units

### P1 — Design-parts registry + tags
Create `product/surfaces/web/pico/pico-design-parts.ts`
(`PICO_DESIGN_PARTS`, `picoDesignPartAttrs(part, instanceId?)` →
`data-korri-part/layer/name/instance-id`). Enumerate every atom/molecule/
organism/template/page and tag each component root. Mechanical but broad
(~90 components). Group commits by layer (atoms, molecules, organisms,
templates, pages).

### P2 — Part-first mount root
Add an `onRegistry` bridge to `mount-pico.tsx` (`PicoRegistryBridge`), then add
`mount-pico-part.tsx` (`PicoPartSurface`) mirroring `ShiftPartSurface`:
`RegistryProvider` + `useAtomInitialValues` + optional `onRegistry`, no router.

### P3 — Live device facts (production derivation)
Replace `PicoStatusBar`'s static clock/battery/wifi with real consumption of
the shared device-state foundation: add `pico-power-state.ts`,
`pico-network-state.ts`, `pico-clock-state.ts` (mirroring the shift-*-state
derivations), and derive the status-bar display from `deviceStateAtom` — never
hand-set props. Unit-test the derivations.

### P4 — Part-scoped edges
Add `tools/theme-workshop/lab/adapters/pico-edges.ts`:
`picoSurfacePartEvents` (battery + network as events), `picoSurfacePartInputs`
(clock live input, and any held ambient values), keyed by story. Reuse shared
`lab-part-edges.ts` for the device-composition helpers.

### P5 — Surface-part mount specs + adapter wiring
Add `tools/theme-workshop/lab/adapters/pico-surface-part.tsx`:
`picoSurfacePartMount` (specs for the real page-parts the lab mounts, with
`reseedKeys`) and `renderPicoSurfacePart`. Wire the new fields into `pico.ts`
(`partRegistryRoot`, `surfacePartMount`, `renderSurfacePart`,
`surfacePartInputs`, `surfacePartEvents`, `sources`,
`makeSeedInitialValuesForBinding`) and add `pagePartId` to adapter screens.

### P6 — Device-as-composition
Make devices inherit edges from the composed page part (shared
`deviceEventsForScreen`/`deviceInputsForScreen` + stable `pagePartId`), dropping
inputs an axis covers. Expose the real routed page-parts (Home, Game Detail, and
any additional committed screens) through the adapter so a device mounts a page
part rather than a screen-scoped edge set.

### P7 — Playbook + ledger; retire throwaway framing
Write `docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md`
and a `conversion-ledger.md` enumerating every pico part with real status.
Update `pico/NOTES.md` to drop the THROWAWAY framing (pico is now a real
target).

### P8 — Invariant tests
Add `tools/theme-workshop/lab/pico-part-first-invariants.test.ts` mirroring the
Shift invariants: registry cleanliness, edges keyed by story, device-as-
composition parity, and every discovered part carrying a design-part tag.

## Working style
Dedicated worktree `feat/pico-part-first`. Behavior/markup preserving where
tags are added. `bunx biome check --write` + `bun test` + typecheck-grep per
slice; commit per coherent slice. Review pass (correctness + maintainability)
before integrating. Rebase/ff to trunk; delete branch + worktree. Never push /
open a PR unless asked.
