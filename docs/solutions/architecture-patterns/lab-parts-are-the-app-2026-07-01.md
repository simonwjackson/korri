---
title: Parts are the app; devices are mounts
date: 2026-07-01
area: architecture
---

# Parts are the app; devices are mounts

The theme-workshop dev-lab treats atomic-design parts as the unit of the
application. A part is a real product component (`*.{atom,molecule,organism,template,page}.part.tsx`)
driven only through real edges; a device is a composition/mount of page parts
at physical size, owning no product state of its own. This extends the lab's
governing principle — "the tool is the app unwrapped, never a simulation" —
down to every placed part on the canvas.

## Invariants

1. **One renderer.** Every canvas object — a full live device or a single
   placed atom — renders the real component. No static re-implementations, no
   pre-baked snapshot paths for parts that have a real upstream.
2. **One drive mechanism.** Placed parts mount through the same real mount +
   scoped registry path a live device uses (`LabPartMount` + the surface's
   part registry root, e.g. Shift's `ShiftPartSurface` in
   `product/surfaces/web/shift/mount-shift-part.tsx`). Binding edits re-seed
   the live registry (`registry.set`), never key-remount, and never re-render
   from props.
3. **Edges belong to parts.** Axes (state machines), inputs (held product
   values), and events (device facts over time) attach to the part whose real
   subtree consumes them, keyed by story (`surfacePartInputs`,
   `surfacePartEvents`). A live device INHERITS its edges from the page part
   its screen composes (`deviceEventsForScreen` resolves route → page part);
   it declares none of its own.
4. **Device facts flow through production derivation.** A battery event lands
   in `deviceStateAtom` and reaches the rendered battery through
   `shiftPowerDisplayForDeviceState` — the same chain the Home route runs.
   Leaf atoms stay prop-driven; the event→state derivation lives at the
   composing host level (the atomic-layering rule). Hand-set props for a part
   with a real upstream are a violation.
5. **Render vs capture separation.** A placed part host renders the real part
   but never publishes to the capture seam; only a single running
   Device/Preview owns the live coordinate.
6. **No preview singletons.** Any `preview ?? live` seam is debt to drive out,
   not a pattern to copy.

## Conversion playbook (per part)

1. **Extract the real sub-component** from its monolithic page/composition if
   needed. Behavior-preserving: add characterization coverage before moving
   code, keep the rendered output identical.
2. **Author the `.part.tsx`** beside the component at the correct atomic
   layer, rendering the REAL component from fixture-backed data. Derive state
   variants from real machine/display tags (e.g. `CATALOG_DISPLAY_TAGS`),
   never a hand-listed copy.
3. **Wire real edges.** If the part's subtree reads atoms, give it a live
   mount spec (`surfacePartMount`: binding→atoms projection + real subtree,
   with a derivation host when the part consumes device facts). Declare its
   events in the surface's part-edges map (`shift-edges.ts`). Held product
   values become inputs (`surfacePartInputs`); transient device facts become
   events. A pure presentational part with no real upstream stays prop-driven
   and is recorded as "no device edge" in the ledger.
4. **Avoid duplicate discovery.** If the screen was previously exposed through
   a page-level bridge (e.g. `ShiftScreens.page.part.tsx`), narrow the bridge
   as atomic parts land so `parts-discovery` collects one story per design
   part.
5. **Test through the real chain.** At minimum: the part renders from fixture
   data at its layer; its edges drive the real atoms (fire an event, assert
   the rendered output changed through the production derivation); regression
   on the existing component tests.
6. **Tick the conversion ledger** (`work/items/active/…/conversion-ledger.md`
   while the roadmap is active) with layer, edges, and status.

## Where things live

- Registry hub + scoped dispatch: `tools/theme-workshop/lab/model/lab-surface-registries.ts`
- Part mount host: `tools/theme-workshop/lab/part-mount/LabPartMount.tsx`
- Part-scoped edge resolution: `tools/theme-workshop/lab/model/lab-part-edges.ts`
- Shift part edges: `tools/theme-workshop/lab/adapters/shift-edges.ts`
- Shift live-mount specs: `tools/theme-workshop/lab/adapters/shift-surface-part.tsx`
- Shift part registry root: `product/surfaces/web/shift/mount-shift-part.tsx`

pico and boxbuster still use the legacy screen-scoped/static mechanisms; apply
this playbook when their conversion roadmaps start.
