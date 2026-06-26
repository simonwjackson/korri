# Lab state model — regions, nesting, multi-active

## The realisation

A screen's state is **not one path**. It's a *set* of concurrently-live machines:

- **XOR region** — exactly one active (`Data`: Loading | Ready | Empty | …).
- **Nested** — a sub-machine that only exists under one parent state (`Launch` under `Data:Ready`).
- **Parallel (AND)** — several XOR regions live at once (`Connection`, `Session` alongside `Data`).
- **Multi-active** — 0..n on at the same time (`Overlays`: toasts/banners).

Key simplification: **a "region" is just a top-level (parentless) axis.** Orthogonality
falls out of having sibling parentless axes; we don't need a separate `Region` type.
So this is three additions to today's `LabStateAxis`, not a rewrite.

## Schema (evolution of `lab-state-axis.ts`)

```ts
export const LAB_AXIS_LIVE = "__live__" // unchanged sentinel: "let the live machine drive"

export type LabAxisKind = "single" | "multi"
//  single = XOR    → one state, or Auto (live)
//  multi  = 0..n   → a pinned-on subset, or Auto (live) when empty

export interface LabStateAxis {
  readonly id: string
  readonly label: string
  readonly kind: LabAxisKind            // NEW — defaults to "single"
  readonly liveLabel: string            // "Auto"
  readonly states: readonly LabStateAxisOption[]   // DERIVED from machine .tags

  // NEW — structural nesting, replacing the old enabledWhen predicate.
  // This axis is only meaningful while `axisId` sits on one of `whenStates`.
  readonly parent?: {
    readonly axisId: string
    readonly whenStates: readonly string[]   // e.g. ["Ready"]
  }
  readonly disabledHint?: string

  // side effects onto the surface's production-inert preview singletons
  readonly pin: (stateId: string) => void
  readonly release: (stateId?: string) => void  // stateId only used by multi (turn one off)
  readonly renderSample?: (stateId: string) => ReactNode
}
```

### Active state (per axis, discriminated by kind)

```ts
export type LabAxisActive =
  | { readonly kind: "single"; readonly value: string }        // tag | LAB_AXIS_LIVE
  | { readonly kind: "multi";  readonly on: ReadonlySet<string> } // empty = Auto/live

export type LabScreenActive = Readonly<Record<string /*axisId*/, LabAxisActive>>
```

### Capture-back coordinate

```ts
// What "Pin current" reads off the running surface — a value PER axis, not a path.
export type LabScreenCoordinate = Readonly<Record<string /*axisId*/, string | readonly string[]>>
```

## Derivation rules (unchanged in spirit, generalised)

- **Auto / Live**: `single` is live when `value === LAB_AXIS_LIVE`; `multi` is live when `on` is empty.
- **Global mode**: `live` iff *every* axis (all regions) is live; otherwise `inspect`. (Same rule, now across regions.)
- **Enabled**: `parent` ? parent's single value ∈ `whenStates` : always. A disabled nested axis is force-released (today's behaviour, generalised).
- **States are derived** from each machine's `.tags` — never hand-authored (unchanged).

## How Shift Home maps

| Axis        | kind   | parent                         | notes                          |
|-------------|--------|--------------------------------|--------------------------------|
| `data`      | single | —                              | top-level region (XOR)         |
| `launch`    | single | `{ data, whenStates:["Ready"] }` | nested under Ready             |
| `foreground`| single | —                              | parallel Foreground Session Gate region |
| `overlays`  | multi  | —                              | future 0..n toasts/banners      |

`data` + `launch` already exist; `foreground` is a real parallel machine already
wired into the Shift runtime; `overlays` is shown as the future `multi` consumer
once a real multi-active product machine exists. The change is (1) tagging
`kind`, (2) turning `launch`'s old predicate into a structural `parent`, and (3)
adding set-valued active support for `multi` axes. Connection/Session are just
more single axes if/when those machines are surfaced.

## Panel rendering (Variant B)

- Top-level axes stack with a divider between them (each is a region).
- A nested axis renders **indented/revealed under its parent's enabling state** and
  disappears otherwise.
- A `multi` axis renders as **checkboxes** (not a single pick), making "this is a set,
  not a path" legible.

## Migration

1. Add required `kind` + structural `parent` to `LabStateAxis`; delete the old
   predicate-based nesting field rather than keeping a compatibility shim.
2. `axisEnabled` reads `parent` and the discriminated screen-active map.
3. Flat string active maps → `LabScreenActive` (discriminated); update
   `liveActiveMap`, `pin/releaseAxisActive`, `restorePinsActive`, and
   `useLabAxisController` to handle the `multi` branch. Single-axis paths keep
   the same user-visible behavior.
4. Adapters: `axesForScreen` already returns a flat list — just annotate
   kinds/parents and add real regions. No `regionsForScreen` needed.
```
