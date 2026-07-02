# Pico: parts are the app (part-first conversion)

_2026-07-02_

Pico received the same **part-first** treatment as Shift (see
`lab-parts-are-the-app-2026-07-01.md`). This records what pico already had, what
the conversion added, and the invariants that keep it honest.

## Starting point

Pico was already fully **atomically decomposed** — a complete
`ui/atoms | molecules | organisms | templates` kit (13 / 16 / 62 / 3), each with
a `.part.tsx` catalog entry and a `.story.tsx`, and ~74 pages composing them.
What it lacked was the *part-first architecture*: design-part tags, a part
registry mount, live device facts, part-scoped edges, and device-as-composition.

It was also (mistakenly) framed as a throwaway prototype with a standalone
gallery route. That framing was retired: there is no separate gallery — **pico
lives entirely in the device lab** (`tools/theme-workshop/`), which surfaces
every kit part via `*.part.tsx` discovery and every page as a page-layer story.

## What the conversion added

1. **One source of truth for parts** — `pico-design-parts.ts`
   (`PICO_DESIGN_PARTS`, `picoDesignPartAttrs`). Every kit part's root carries
   `data-korri-part/layer/name`, so the lab can pick it. Parts whose root is a
   composed child (`List`, `KeyArtBackdrop`, `ScreenShell`, `PicoArtImage`,
   `renderPicoCart`) accept a `partAttrs` override so the composer claims the
   shared root without adding a wrapper. Fragment-rooted parts
   (`FilterSortPanel`) stay story-identified.

2. **One drive mechanism** — `mount-pico-part.tsx` (`PicoPartSurface`) mounts a
   single part against the same real provider stack `mountPico` gives the full
   surface (a fresh atom registry + initial values + the `onRegistry` seam),
   minus the router. `PicoRegistryBridge` reports the registry; inert in
   production.

3. **Device facts through production derivation** — the status bar no longer
   hard-codes `10:24 / 82% / wifi`. `pico-{power,network,clock}-state.ts` derive
   from the shared `deviceStateAtom` (+ pico network/clock atoms).
   `PicoStatusBar` is a pure prop-driven molecule; `PicoStatusBarLive` is the
   composing host that derives battery/network/clock and passes props — the same
   `deviceStateAtom -> picoPowerDisplayForDeviceState -> props` chain everywhere.
   `ScreenShell` and the routed screens render the live host.

4. **Edges belong to parts** — `pico-edges.ts` declares battery + network as
   events and the clock as a held input, keyed by story
   (`picoSurfacePartEvents` / `picoSurfacePartInputs`). Emitting drives the same
   atoms the mounted surface reads.

5. **Device is a composition** — a live device declares no edges of its own. It
   inherits them from the page part its mounted screen composes: the adapter's
   screen entries carry a stable `pagePartId` (`pico.home`, `pico.game-detail`),
   and the shared `deviceEventsForScreen` / `deviceInputsForScreen`
   (model/lab-part-edges.ts) resolve that page part and return its edges.

6. **Live mount specs** — `pico-surface-part.tsx` seeds the device-fact atoms
   for the Status Bar and the Home / Game Detail page parts; on a binding edit
   only the pairs whose `reseedKeys` entry changed are re-written, so editing one
   input never rolls back event-driven facts.

## Invariants (enforced)

`tools/theme-workshop/lab/pico-part-first-invariants.test.ts`:

- every part that declares device events has a live mount spec;
- the adapter declares no screen-scoped product edges (`eventsForScreen` /
  `inputsForScreen` are undefined);
- the shared mount + registry path exists (`partRegistryRoot`,
  `surfacePartMount`);
- device screens route to page parts by stable `pagePartId`;
- a device inherits battery + network + clock edges from its composed page part;
- device facts seed through the production derivation, not raw props.
