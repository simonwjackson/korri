---
date: 2026-07-05
topic: lab-take-marker-decoupling
artifact: handoff
area: tools/theme-workshop (device lab / parts catalog)
status: proposed
---

# Lab "Take" Marker Decoupling Handoff

## Purpose

Make **"take" a first-class, arbitrary marker** meaning *"this part is still in
exploration — not ready to be treated as finished."* Today "take" is not a
marker at all; it is an emergent property of **where a file lives** and **how it
was authored**. The goal of this work is to sever that coupling so that:

1. **Any part can be marked a take** — at any atomic layer (atom, molecule,
   organism, template, page), authored by a human or an AI.
2. **A take keeps its real layer.** Marking a `template` part as a take must show
   it under **Templates** with a "Take" badge — not relocate it to "molecules".
3. **Takes are not tied to a folder.** A take can be co-located next to the
   component it explores. The `ai-takes/` directory must stop being the
   *definition* of "take"; at most it stays as one (AI-generation) source.

This is a device-lab / parts-catalog concern only (`tools/theme-workshop`). It
does not touch product runtime, RPC, or any surface's shipped behavior.

## Why this matters (the flaw, concretely)

"Take" currently means exactly one thing: **"a file inside
`product/surfaces/web/<surface>/ai-takes/` that is named `<slug>.molecule.part.tsx`."**
Every consequence the user actually wants ("badge it as provisional", "let me
delete it easily") is bolted to that one accident of location + filename, and so
are consequences they do **not** want:

- A take **always renders under "molecules"**, regardless of what it is.
- A take **cannot be a template** (or any non-molecule layer).
- A take **cannot live next to the real component** it prototypes.
- A take is implicitly framed as "AI-authored" even when a human wrote it.

Repeated attempts to give a template-layer part the take badge are impossible
without this change: the two properties are mutually exclusive as built.

## Current architecture (verified, with references)

There are **two independent discovery paths** into the parts catalog, and the
"Take" badge only exists on one of them.

### Path A — compile-time glob (normal parts)
- `product/surfaces/web/parts-glob.ts` globs `./**/*.part.tsx`.
- `tools/theme-workshop/lab/parts-discovery.ts`:
  - `parsePartPath` (const `PART_PATH`) accepts **any** layer suffix
    `(atom|molecule|organism|template|page)` and derives `layer` from the
    filename. So a committed `Foo.template.part.tsx` is correctly a `template`.
  - `collectPartsFromModules` / `loadSurfacePartsResult` **explicitly skip any
    path containing `/ai-takes/`** (the `if (path.includes("/ai-takes/")) continue`
    guards). So committed parts can be any layer but **can never be takes**.
  - `storyFromExport` reads only `name`, `note`, `surface`/`presentation`,
    `designPartId`, `state`, `variants`, `render` from a default export
    (`RESERVED_EXPORTS`). It does **not** read any "take" marker, and there is no
    `take` field on `Story` to read into.

### Path B — runtime AI-takes loader (the only source of the badge)
- `tools/theme-workshop/lab/design-pass/ai-parts-loader.ts`
  - `loadAiPartStories(surfaceId, layer: StoryLayer = "molecule")` — **layer
    defaults to `"molecule"`.**
  - Fetches `/__lab/ai-parts/:surface`, dynamically imports each file, and builds
    a `Story` with `aiTakeSlug: ref.slug` (this is what draws the badge) and
    `layer` = the passed-in layer.
- `tools/theme-workshop/lab/LabShell.tsx` calls `loadAiPartStories(adapter.id)`
  at lines ~411, ~581, ~668 — **no layer argument**, so every take is `molecule`.
- `tools/theme-workshop/lab/vite.config.mjs` dev-server endpoints:
  - Listing (`GET /__lab/ai-parts/:surface`, ~line 222): only matches
    `entry.match(/^([a-z0-9-]+)\.molecule\.part\.tsx$/)` under the surface's
    `ai-takes/` dir. **Filename layer is hardcoded to `molecule`.**
  - Delete (~line 255): removes `ai-takes/${slug}.molecule.part.tsx`.
  - Generate (~line 352): writes `${base}.molecule.part.tsx`.
  - `PART_IMPORT_ALLOWLIST` + `isWritablePartFile` (~lines 185–205) gate the AI
    **write** path to a tiny import allowlist (react + a few Shift atoms).
  - `watch: { ignored: ["**/ai-takes/**"] }` (~line 543).
- `ai-takes/` is **gitignored** and excluded from the repo typecheck.

### Where the badge/delete are drawn (consume Path B only)
- `tools/theme-workshop/lab/canvas/LabGalleryView.tsx` (~106–116) and
  `tools/theme-workshop/lab/panels/LabPartsList.tsx` (~62–73): render the
  `Take` badge and the delete button **iff `story.aiTakeSlug`** is set
  (`pending` shows a skeleton "Take").
- `tools/theme-workshop/lab/canvas/LabDraggablePart.tsx` (~143–144) and
  `tools/theme-workshop/lab/design-pass/design-pass-model.ts` (`role: "take"`,
  label at ~78): a parallel design-pass "take" role, also badge-only.

### Net effect
`aiTakeSlug` (badge + delete) ⟺ Path B ⟺ `ai-takes/` folder ⟺ `.molecule.part.tsx`
⟺ `layer: "molecule"`. All four are the same fact. That is the flaw.

## Desired end state

- A **`take` marker is a declared property of a part**, not a location.
  Preferred shape: a boolean/enum on the part's default export / StorySpec, e.g.
  `take: true` (bikeshed: `status: "exploration" | "ready"`). Decide the spelling
  with the human (see Open Questions).
- `Story` gains a `take?: boolean` field. `storyFromExport` reads the marker from
  the module and sets it. The compile-time glob path (Path A) can now produce
  takes **at their real layer**, co-located with the component.
- The lab badge + remove/promote affordance key off **`Story.take`**, not
  `aiTakeSlug`. `aiTakeSlug` (if kept) becomes only an AI-scratch *delete handle*,
  not the definition of "take".
- **Layer is preserved** for takes from the filename suffix (already true on Path
  A via `parsePartPath`). A `.template.part.tsx` take shows under Templates.
- **Location is free.** A take can sit next to its component
  (`product/surfaces/web/shift/ShiftHomeUpNext.template.part.tsx` with
  `take: true`). `ai-takes/` is no longer required and should not be the marker.
- **Remove/promote:** removing a take deletes the file at its real path (works
  for any location/layer); "promote" strips the `take` marker so the part
  graduates in place. Decide whether the lab edits the file or just deletes it.

## Suggested implementation direction

1. **Story type** (`tools/theme-workshop/lab/types.ts`): add `readonly take?: boolean`.
   Keep `aiTakeSlug`/`pending` for the AI-scratch/generation lifecycle only.
2. **Discovery** (`parts-discovery.ts`): in `storyFromExport`, read `take`
   (and/or `status`) from the module default export / StorySpec and set
   `Story.take`. Add `take`/`status` to the reserved-export handling so a raw
   `take` export isn't mistaken for a variant.
3. **Stop skipping co-located takes**: the `/ai-takes/` `continue` guards in
   `collectPartsFromModules` and `loadSurfacePartsResult` should remain **only**
   to avoid double-loading files that Path B also serves — not as the take
   definition. Co-located takes flow through Path A normally.
4. **Badge/remove UI** (`LabGalleryView.tsx`, `LabPartsList.tsx`,
   `LabDraggablePart.tsx`): draw the "Take" badge when `story.take || story.aiTakeSlug`.
   Wire "remove" to delete the file by its real repo path (new/[generalized]
   dev-server route), not the hardcoded `ai-takes/<slug>.molecule.part.tsx`.
5. **Dev-server routes** (`vite.config.mjs`): if the AI-scratch path is retained,
   generalize the listing/delete/generate regexes from `\.molecule\.part\.tsx`
   to `\.(atom|molecule|organism|template|page)\.part\.tsx` and carry the matched
   layer through `ai-parts-loader.ts` (drop the `"molecule"` default; infer per
   file). Better: add a small "remove part file" route keyed on a repo-relative
   path so committed takes can be removed from the lab too.
6. **AI generation stays a separate concern.** The generate workflow may keep
   writing to `ai-takes/` and simply set `take: true` in the emitted file. The
   badge then comes from the marker, not the folder. Consider renaming the
   concept in comments from "AI take" to "scratch/generated part" to stop
   conflating provenance with the take marker.

## Migration / concrete test case

Three real takes already exist to migrate and prove the change (currently forced
to molecule under `ai-takes/`, gitignored):

```text
product/surfaces/web/shift/ai-takes/shift-home-up-next.molecule.part.tsx
product/surfaces/web/shift/ai-takes/shift-home-up-next-wildcard.molecule.part.tsx
product/surfaces/web/shift/ai-takes/shift-home-up-next-discovery.molecule.part.tsx
```

After the change they should become co-located, layer-correct takes, e.g.:

```text
product/surfaces/web/shift/ShiftHomeUpNext.template.part.tsx           (take: true)
product/surfaces/web/shift/ShiftHomeUpNextWildcard.template.part.tsx   (take: true)
product/surfaces/web/shift/ShiftHomeUpNextDiscovery.template.part.tsx  (take: true)
```

…and appear under **Templates** with the **Take** badge + remove affordance.
Format exemplar for a committed template part:
`product/surfaces/web/shift/ShiftCinematicHome.template.part.tsx`.

(Content of those three is already on-brand: they compose real Shift primitives
and tokens — `ShiftCinematicHome`, `ShiftCineRail`, `ShiftCineBackdrop`,
`ShiftCineChip tone="reason"`, and a `ShiftCineSurpriseTile` mirroring
`ShiftCineLibraryTile`. The redesign is about the take *mechanism*, not their
visuals.)

## Constraints & gotchas

- **Part-first invariants**: `tools/theme-workshop/lab/part-first-invariants.test.ts`
  and `lab-boundary.test.ts` enforce architecture rules on committed parts. Run
  them **from the repo root** (they resolve `tools/theme-workshop/lab/adapters`
  repo-relative; running from inside the workshop dir yields false ENOENT
  failures).
- **Container-query framing**: Shift home parts render under
  `[data-shift-home].shift-cine.intrinsic`, which defines `--cine-tile` and the
  type scale from `cqi/cqh`. A take that renders a full home needs an intrinsically
  sized ancestor. Full-surface parts want `surface: true` framing — note that the
  **current AI loader ignores `surface`/`presentation`** (only reads
  `name`/`note`/`render`), which is another reason to route takes through the
  full StorySpec-aware Path A.
- **Import allowlist** only applies to the AI **write** path; hand-authored files
  are not restricted at runtime. If takes become normal committed parts, the
  allowlist is irrelevant to them.
- **gitignore / typecheck**: `ai-takes/` is gitignored and excluded from repo
  typecheck. Co-located committed takes will be **version-controlled and
  typechecked** — desirable (a take is "not ready", not "not tracked"), but
  confirm that's intended (see Open Questions).

## Acceptance criteria

- [ ] A part at **any** layer can set the take marker and renders under its real
      layer group with the "Take" badge.
- [ ] A take can be **co-located** with its component (no `ai-takes/` required)
      and still shows the badge + a working remove affordance.
- [ ] Marking a `.template.part.tsx` as a take shows it under **Templates**, not
      molecules.
- [ ] The three Shift Up Next takes are migrated to co-located template takes and
      appear correctly.
- [ ] Existing AI-generated scratch parts still load and badge (back-compat or a
      migration), with the badge driven by the marker.
- [ ] `parts-discovery.test.ts` covers the new marker; `part-first-invariants` and
      `lab-boundary` tests pass from repo root.

## Open questions for the human

1. **Marker spelling**: `take: true` vs `status: "exploration" | "ready"` vs a
   `note`-convention. Recommend an explicit boolean/enum field over `note`.
2. **Git-tracked takes**: confirm co-located takes should be committed &
   typechecked (recommended), while `ai-takes/` stays gitignored scratch.
3. **Remove vs promote semantics**: should the lab "remove" delete the file, and
   should there be a "promote" that strips the marker in place? Who owns writing
   that edit (dev-server route vs manual)?
4. **Keep the AI scratch path at all?** If AI generation continues, keep
   `ai-takes/` as a generated-scratch source that simply sets `take: true`; if
   not, the runtime loader (Path B) and its molecule-only regexes can be retired.

## Appendix — key files

```text
tools/theme-workshop/lab/types.ts                         # Story type (+ add `take`)
tools/theme-workshop/lab/parts-discovery.ts               # Path A discovery; read the marker here
tools/theme-workshop/lab/design-pass/ai-parts-loader.ts   # Path B; molecule default; aiTakeSlug
tools/theme-workshop/lab/LabShell.tsx                     # calls loadAiPartStories (no layer)
tools/theme-workshop/lab/vite.config.mjs                  # ai-takes lister/delete/generate (molecule-only regex)
tools/theme-workshop/lab/canvas/LabGalleryView.tsx        # badge/delete keyed on aiTakeSlug
tools/theme-workshop/lab/panels/LabPartsList.tsx          # badge/delete keyed on aiTakeSlug
tools/theme-workshop/lab/canvas/LabDraggablePart.tsx      # design-pass role === "take"
tools/theme-workshop/lab/design-pass/design-pass-model.ts # LabDesignPassEntryRole = "take"
product/surfaces/web/parts-glob.ts                        # ./**/*.part.tsx glob
product/surfaces/web/shift/ShiftCinematicHome.template.part.tsx  # committed template exemplar
product/surfaces/web/shift/ai-takes/shift-home-up-next*.molecule.part.tsx  # migrate these
```
