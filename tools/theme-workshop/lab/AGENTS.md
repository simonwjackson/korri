# dev-lab (`just dev-lab`)

A dev-only design tool that renders real product surfaces on a physical-size
device lab. It is never bundled with `product/apps/*`.

> Governing rule: the tool is the app unwrapped, never a simulation. Swap the
> data at the last-mile edge; never the mechanism. See `../AGENTS.md`.
>
> One workspace over the same real app: **live device objects** validate the
> page on physical hardware that tiles 1..n screens, while **placed part
> objects** design one logical screen or atomic part in isolation. Both share
> real product render paths — the lab always renders the real page/part, never a
> static re-implementation. See `../AGENTS.md` → "Two object types: live devices
> and placed parts".

## State axes + Inspect ⇄ Live

A surface's screens **are** its page parts. Each page exposes its real
state-machine **axes** — Shift Home has a `Data` region (`ShiftCatalogState`)
and a parallel `Foreground` region (`ForegroundSessionGateState`); Pico Home has
a `Data` region. Shift Launch is produced by pressing Play against the real
in-memory launcher, not injected as an axis. There is no fixed, global state vocabulary: an axis's states are
**derived from the machine's tags** (`axisOptionsFromTags(Machine.tags)` or an
exhaustive sample table's keys), never hand-listed.

A region is just a parentless axis. `LabStateAxis.kind` declares whether the axis
is `single` (XOR: one pinned state or Auto) or `multi` (0..n pinned states, shown
as checkboxes). Nesting is structural: child axes declare
`parent: { axisId, whenStates }`, so the panel can reveal children under the
parent state. Do not use opaque runtime predicates for nesting.

Live-device state dials and screen inputs are shared across live device objects
for now, matching the mounted surface registry model. Placed part object inputs
are object-local seeds: on a live-mounted part they re-seed its own registered
registry (no remount), never a props re-render.

## Parts own the edges; a device is a composition

Edges attach to **parts**, keyed by story: held **inputs** via
`surfacePartInputs`, discrete device **events** via `surfacePartEvents` (both
in `adapters/shift-edges.ts` for Shift). A live device declares no product
edges of its own — it INHERITS them from the page part its mounted screen
composes (`model/lab-part-edges.ts`: `deviceEventsForScreen`,
`deviceInputsForScreen`, resolved route → page part), dropping any held input
an axis already covers (the axis is the richer live control for the same
edge). Legacy `inputsForScreen`/`eventsForScreen` declarations remain only as
the fallback for surfaces that have not migrated (pico, boxbuster).

Placed parts mount through the SAME real mount + scoped registry path a live
device uses: `part-mount/LabPartMount.tsx` hosts the surface's part registry
root (Shift: `product/surfaces/web/shift/mount-shift-part.tsx`) and registers
the part's registry under the owning canvas object's scope, so part edges
drive real atoms. Device facts reach an isolated part through its production
derivation (e.g. battery: `deviceStateAtom` →
`shiftPowerDisplayForDeviceState` → props) — never hand-set props. See
`docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md`.

A single global **Inspect ⇄ Live** mode is the only difference between a frozen,
addressable coordinate and the running, navigable surface:

- **Inspect** pins at least one axis to one state (`single`) or a set of states
  (`multi`).
- **Live** releases every axis and lets the mounted surface run.

Switching a single axis between pinned and live needs **no remount**.

## The seam: swap real data at the mounted app's edge

Inspect pins drive the same source atoms the mounted product app already reads.
The lab captures each mounted surface's registry, then a pin swaps that registry's
source layer; releasing the pin restores the seed value the app was mounted with.
The route still reads the real atom:

```ts
// product/surfaces/web/shift/routes/ShiftHomeRoute.tsx
const snapshot = useAtomValue(catalogSnapshotAtom)
```

For Shift, the Data axis swaps `catalogFactsSourceLayerAtom`, and Foreground
swaps `foregroundSessionStatusLayerAtom`. Launch is not injected as a design-tool
axis; pressing Play runs the real in-memory launcher and lets the app produce the
real launch state.

Pico still has a transitional preview singleton. Do not copy that pattern for new
Shift work or new surfaces; prefer the real-edge source swap.

## Adding a new surface's state machine

To expose a new state machine as an axis, follow the existing Shift pattern:

1. **Product side:** keep the route reading its real source atom. Provide an
   exhaustive sample table or source-layer factory keyed by the machine's tags.
2. **Lab side:** declare a `LabStateAxis` in the surface adapter
   (`adapters/<surface>-axes.tsx`) whose `pin` swaps the mounted registry's real
   source layer and whose `release` restores the seed layer. Set `kind` to
   `single` or `multi`. For nesting, declare `parent: { axisId, whenStates }`.
3. Optionally implement `captureCoordinate` for "Pin current" (Live → Inspect),
   returning per-axis tags for `single` axes and tag arrays/sets for `multi`
   axes.

## Boundary

Product runtime must **not** import dev-lab runtime modules (`lab-boundary.test`
enforces this). The lab consumes product surfaces through the surface adapter,
which is the only lab → product bridge. Previews stay offline / fixture-backed —
mounting a page part must not add external art calls.
