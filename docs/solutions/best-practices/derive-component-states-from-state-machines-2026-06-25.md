# Derive component states from state machines (don't hand-author stories)

**Date:** 2026-06-25
**Applies to:** surface UI (Shift, Pico, future surfaces), gallery/parts, tests
**See also:** `product/platform/state/state-machine.ts`, `product/platform/state/state-variants.ts`, `docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md`

## The rule

A component's states are the **cases of a state machine**, and that machine is
the single source of truth for *which* states exist. Anything that shows or
tests those states — a gallery, a knob, a test — **derives** the list from the
machine's `.tags`. We do **not** hand-maintain a parallel list of states.

The only hand-written part is the **sample value** for each case (which game,
which error message). That is irreducible taste. The *enumeration* is derived.

## Why

Storybook's cost is that you hand-write a story per state, and forgetting one is
silent. Our states already come from typed machines, so we can enumerate them
instead — and make "you forgot a state" a **compile error**.

This is not theoretical. The hand-written launch-preview list in the lab was
missing `ReleaseSelectionRequired`; deriving it from `LaunchState.tags`
surfaced the gap immediately. Separately, retired rail-home components were
resurrected to "fill" a gallery — a gallery driven by what's *live* and its
machines can't drift back to dead code that way.

## How

1. **Model state as a machine.** A tagged union plus `stateMachine<S>(tags)`
   (`product/platform/state/state-machine.ts`). `.tags` is the enumeration;
   `.select(tag)` narrows. Domain models (`ShiftCatalogState`, `LaunchState`,
   `PicoDataState`) build on it and add their own `fromResult`/constructors.

2. **Derive variants with `stateVariants`.** Given a machine and a producer
   keyed by **every** tag, it returns one labeled variant per state. The
   producer record is exhaustive: omit a tag and it won't compile; add a case to
   the machine and every consumer breaks until handled
   (`product/platform/state/state-variants.ts`).

3. **Feed one source into every view.** A gallery part *exports* the derived
   array (the parts gallery fans it out); a knob maps the same variants to
   options. One declaration, many views — they cannot disagree.
   - Prop-driven states: pass `variant.value` as a prop
     (`ShiftCinematicHomeStates.page.part.tsx`).
   - Seeded states: feed `variant.value` (an `AsyncResult`) to the real
     state-root and let the machine pick the body
     (`ShiftCatalogHomeStates.page.part.tsx`, `PicoDataStates.page.part.tsx`).

## The five habits that keep this working

1. **Data enters at the top edge; everything below takes plain inputs.** A deep
   component that reaches for global state on its own can't be rendered freely.
2. **Spell inputs as small labeled sets, not loose strings.** A literal union
   becomes a control automatically; `string` cannot.
3. **Put reviewable state in the machine, not scattered flags or hidden
   `useState`.** If you'd want to *see* a state, it must be an input, not a
   private variable the tooling can't reach.
4. **Keep side effects (fetch, timers, `window`) at the edges.** A pure leaf
   renders safely in a wall of a hundred; an effect-on-mount leaf does not.
5. **Never resurrect retired components to fill a gallery.** The gallery shows
   what's *live*, across its states. Dead code stays deleted.

## What this is not

Not a framework. The leverage is the small shared helper plus the discipline. If
the pattern doesn't pay off on a given component, don't force it — but don't
hand-list states as the default, either.
