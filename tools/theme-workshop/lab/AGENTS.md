# dev-lab (`just dev-lab`)

A dev-only design tool that renders real product surfaces on a physical-size
device lab. It is never bundled with `product/apps/*`.

## State axes + Inspect ⇄ Live

A surface's screens **are** its page parts. Each page exposes its real
state-machine **axes** — Shift Home has a `Data` axis (`ShiftCatalogState`) and a
`Launch` axis (`LaunchState`); Pico Home has a `Data` axis. There is no fixed,
global state vocabulary: an axis's states are **derived from the machine's tags**
(`axisOptionsFromTags(Machine.tags)`), never hand-listed.

A single global **Inspect ⇄ Live** mode is the only difference between a frozen,
addressable coordinate and the running, navigable surface:

- **Inspect** pins an axis to one state.
- **Live** releases the axis and lets the mounted surface run.

Switching a single axis between pinned and live needs **no remount**.

## The seam: a preview singleton the live route consults

Each axis is driven by a **cross-root preview singleton** that lives in the
product surface and is **inert in production** (nothing sets it). The live route
reads `preview ?? live`:

```ts
// product/surfaces/web/shift/routes/ShiftHomeRoute.tsx
const live = useAtomValue(catalogSnapshotAtom)
const snapshot = useShiftCatalogPreview() ?? live
```

The singletons (`shift-catalog-preview`, `shift-launch-preview`,
`pico-data-preview`) expose `set*`, `use*` (a `useSyncExternalStore` hook), and a
non-reactive `get*` for capture-back. A **sample table** keyed by every machine
tag supplies both the inspect pin and the Matrix fan-out render, so the static
fan and the live pin can never drift.

## Adding a new surface's state machine

To expose a new state machine as an axis, follow the existing pattern:

1. **Product side:** a preview singleton + a sample table (one representative
   value per tag) + the live route reads `preview ?? live`.
2. **Lab side:** declare a `LabStateAxis` in the surface adapter
   (`adapters/<surface>-axes.tsx`) wiring `pin`/`release` to the singleton +
   sample table, with `states` derived from the machine tags. Nested axes use
   `enabledWhen` + `disabledHint`. Provide `renderSample(tag)` for the Matrix.
3. Optionally implement `captureCoordinate` for "Pin current" (Live → Inspect).

## Boundary

Product runtime must **not** import dev-lab runtime modules (`lab-boundary.test`
enforces this). The preview singletons live in `product/`; the lab consumes them
through the surface adapter, which is the only lab → product bridge. Previews
stay offline / fixture-backed — mounting a page part must not add external art
calls.
