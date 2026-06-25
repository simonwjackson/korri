---
title: "feat: make dev-lab parts catalogs convention-discovered"
type: feat
status: completed
date: 2026-06-25
verify_command: "bun test ./tools/theme-workshop/lab/parts-discovery.test.ts ./tools/theme-workshop/lab/adapters/pico.test.ts ./tools/theme-workshop/lab/LabRoot.test.tsx && bunx vite build --config tools/theme-workshop/lab/vite.config.mjs"
---

# feat: make dev-lab parts catalogs convention-discovered

## Summary

Make `just dev-lab` the first-class design workspace for surface parts by auto-discovering colocated `*.{atom,molecule,organism,template,page}.part.tsx` files under each surface. The lab should expose `/parts` for any surface with discovered parts, without adapter-level manifests or central story arrays.

---

## Problem Frame

The old `dev-theme-workshop` already has Pico's atomic breakdown, but the new `dev-lab` is the forward path and currently exposes parts through a Pico-specific adapter hook. That keeps the design workflow alive temporarily, but it does not scale to Shift, Boxbuster, or future surfaces without reintroducing manifest maintenance.

---

## Requirements

- R1. `dev-lab` discovers parts automatically from surface-owned files; no central manifest and no adapter-maintained story list.
- R2. The atomic layer is inferred from the filename suffix: `.atom.part.tsx`, `.molecule.part.tsx`, `.organism.part.tsx`, `.template.part.tsx`, `.page.part.tsx`.
- R3. Parts files can live anywhere under `product/surfaces/web/<surface>/`; directory names do not determine layer.
- R4. `/lab/<devices>/<surface>/parts` renders the discovered parts catalog for that surface.
- R5. The lab shows a `Parts` screen/tab only when a surface has discoverable parts, or shows an intentional empty state for direct `/parts` navigation when none exist.
- R6. Pico's existing atomic catalog is migrated to the filename convention and remains available in `dev-lab`.
- R7. Shift gets first-class parts coverage through the same convention, not through restored Storybook-only CSF files.
- R8. Boxbuster can start with coarse, fixture-backed parts that help design iteration without requiring every Three mesh to become individually storyable.
- R9. Parts previews remain fixture-backed and local: no live network calls, no route imports, no live RPC hooks, no global fetch swaps.

---

## Scope Boundaries

- Not preserving `dev-theme-workshop` as the long-term API; it may remain during migration, but `dev-lab` owns the design workflow.
- Not requiring surfaces to organize files into `atoms/`, `molecules/`, etc.; filenames carry the layer convention.
- Not requiring a one-file-per-variant rule. A part file may default-export one preview or named-export multiple variants if useful.
- Not converting every existing Storybook story in one pass. Shift should get enough coverage to make the lab useful, with deeper migration allowed afterward.
- Not extracting every Boxbuster Three.js submesh immediately. Start with named design states and extract smaller seams only where useful.

### Deferred to Follow-Up Work

- Delete or retire `dev-theme-workshop` after dev-lab parts coverage is sufficient for active surfaces.
- Convert any remaining Storybook-only Shift stories after the first dev-lab parts migration lands.

---

## Context & Research

### Relevant Code and Patterns

- `tools/theme-workshop/lab/LabRoot.tsx` — composition root for the new lab; owns adapter, route state, calibration, and frame rendering.
- `tools/theme-workshop/lab/components/LabRouteBar.tsx` — current surface screen tabs; should include discovered `Parts` capability.
- `tools/theme-workshop/lab/components/LabStage.tsx` — current branch point between real mounted surfaces and the temporary `/parts` path.
- `tools/theme-workshop/lab/surface-registry.ts` — adapter contract; should stay focused on runtime mounting, not parts manifests.
- `tools/theme-workshop/Parts.tsx` — existing grouped atomic catalog renderer; reuse it rather than creating another renderer.
- `tools/theme-workshop/types.ts` — existing `Story` / `StoryLayer` shape that can remain the normalized internal rendering contract.
- `product/surfaces/web/pico/stories.tsx` and `product/surfaces/web/pico/config.tsx` — existing Pico catalog source; migration target, not long-term registry pattern.
- `product/surfaces/web/shift/{atoms,molecules,organisms,pages,templates}` — restored Shift parts and story material; source material for dev-lab `.part.tsx` files.
- `product/surfaces/web/boxbuster/{app,scene,vhs,steamgriddb}.tsx` — initial Boxbuster parts should wrap fixture-backed full states and selected HUD/TV seams.

### Institutional Learnings

- Preview environments are first-class consumers: parts must render with fixture data and configured behavior, not live network calls or fetch interception.
- Component taxonomy is a design aid, not a filesystem prison. The selected convention uses filename suffixes so colocation remains flexible.

### External References

- None required; this is an internal lab architecture change following existing Vite `import.meta.glob` discovery patterns already used by Pico stories.

---

## Key Technical Decisions

- **Filename suffix owns the layer.** `ShiftPill.atom.part.tsx` is an atom wherever it lives; moving directories does not change catalog grouping.
- **Discovery is lab-owned.** `tools/theme-workshop/lab/parts-discovery.ts` owns `import.meta.glob` and normalizes modules into `Story[]`; adapters do not list parts.
- **Surface id comes from the path.** Files under `product/surfaces/web/pico/**` belong to `pico`, `shift/**` to `shift`, and so on.
- **Default export is the low-friction path.** A default exported React component becomes one part. Named exported React components become variants when a file needs several states.
- **Metadata is optional and local.** Files may export `note`, `surface`, or `name` when inference is insufficient, but the common case needs only the filename and a default render component.
- **Keep `Parts` as the renderer.** Discovery produces the existing `Story` shape; visual grouping, layer order, framing, and scale controls remain centralized.
- **Lazy-load parts.** Parts should load only when `/parts` is visited so the real-surface lab stays lean and tests do not eagerly evaluate Vite-only glob modules.

---

## Open Questions

### Resolved During Planning

- Should directory path determine atomic layer? → No; filename suffix does, preserving flexible colocation.
- Should every surface maintain a manifest? → No; discovery is convention-based.
- Should this live in Storybook or `dev-theme-workshop`? → No; `dev-lab` is the new design space.

### Deferred to Implementation

- Exact named-export filtering rules for variants (for example, whether to include every PascalCase function or only exports ending in `Part`). Decide while writing `normalizePartModule` tests.
- Whether legacy `.stories.tsx` files should coexist temporarily or be renamed to `.part.tsx` immediately for each surface.
- Which Boxbuster internals are worth extracting into smaller presentational seams after the first coarse catalog states exist.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
product/surfaces/web/<surface>/**/*.<layer>.part.tsx
             │              │          │
             │              │          └─ atom | molecule | organism | template | page
             │              └──────────── arbitrary colocated path
             └─────────────────────────── surface id

Vite import.meta.glob
  -> parts-discovery parses surface + layer + basename
  -> loadSurfaceParts(surfaceId)
  -> normalized Story[]
  -> LabStage renders <Parts stories={...} /> at /parts
```

Recommended authoring shape:

```text
ShiftPill.atom.part.tsx       default export -> one Atom story named "Shift Pill"
ShiftHome.organism.part.tsx   named exports -> variants under Organisms
BoxbusterTv.molecule.part.tsx optional note/surface metadata when needed
```

---

## Implementation Units

### U1. Lab-owned parts discovery

**Goal:** Add the convention-based discovery module that finds and normalizes surface parts without adapter manifests.

**Requirements:** R1, R2, R3, R9

**Dependencies:** None

**Files:**
- Create: `tools/theme-workshop/lab/parts-discovery.ts`
- Create: `tools/theme-workshop/lab/parts-discovery.test.ts`
- Modify: `tools/theme-workshop/lab/surface-registry.ts`

**Approach:**
- Add a Vite-backed glob for `product/surfaces/web/**/*.part.tsx`, narrowed to the accepted filename suffixes.
- Parse surface id and layer from the path, not from folders.
- Normalize default exports and supported named exports into `Story` records.
- Provide `hasSurfaceParts(surfaceId)` and `loadSurfaceParts(surfaceId)` so route chrome and stage rendering can use the same source of truth.
- Remove or deprecate the temporary adapter-owned `loadAtomicCatalog` concept once discovery is in place.

**Execution note:** Implement test-first around path parsing and module normalization before touching lab rendering.

**Patterns to follow:**
- `product/surfaces/web/pico/stories.tsx` for Vite glob discovery.
- `tools/theme-workshop/types.ts` for normalized `Story` / `StoryLayer` shape.

**Test scenarios:**
- Happy path: `product/surfaces/web/shift/chrome/ShiftPill.atom.part.tsx` parses to surface `shift`, layer `atom`, name `Shift Pill`.
- Happy path: `product/surfaces/web/pico/ui/PicoHome.page.part.tsx` parses to surface `pico`, layer `page`, name `Pico Home`.
- Edge case: a file under an arbitrary subdirectory still derives layer from filename, not folders.
- Edge case: `*.part.tsx` without a layer suffix is ignored or reported as invalid according to the chosen test expectation.
- Integration: a module with a default export becomes one `Story`; a module with named variant exports becomes multiple `Story` records with stable ids.

**Verification:**
- Discovery tests prove surface id, layer, id, name, and render normalization without relying on adapter configuration.

---

### U2. First-class `/parts` route in dev-lab

**Goal:** Make `/parts` a generic lab route capability driven by discovery, not a Pico adapter special case.

**Requirements:** R4, R5

**Dependencies:** U1

**Files:**
- Modify: `tools/theme-workshop/lab/components/LabRouteBar.tsx`
- Modify: `tools/theme-workshop/lab/components/LabStage.tsx`
- Modify: `tools/theme-workshop/lab/LabRoot.tsx`
- Test: `tools/theme-workshop/lab/LabRoot.test.tsx`
- Test: `tools/theme-workshop/lab/components/LabRouteBar.test.tsx`

**Approach:**
- Route `/parts` through `LabStage` to the existing `Parts` renderer when discovery returns parts for the current surface.
- Add a `Parts` tab in `LabRouteBar` based on `hasSurfaceParts(themeId)`.
- For direct `/parts` on a surface with no parts, render an explicit empty state with the filename convention so authors know how to add one.
- Preserve real-surface mounting behavior for all other paths.

**Patterns to follow:**
- Existing `LabStage` branch for real mounted surfaces.
- Existing `Parts` renderer from `tools/theme-workshop/Parts.tsx`.

**Test scenarios:**
- Happy path: a surface with discovered parts shows a `Parts` tab and clicking it navigates to `/parts`.
- Happy path: `/lab/all/pico/parts` renders grouped parts instead of mounting Pico frames.
- Edge case: `/lab/all/boxbuster/parts` with no discovered parts renders an empty state, not a crash.
- Integration: switching from `/parts` back to `/game/hollow-knight` remounts the real surface and preserves canonical route sync behavior.

**Verification:**
- Lab tests prove the tab and route are generic and do not depend on Pico-specific adapter fields.

---

### U3. Migrate Pico parts to filename convention

**Goal:** Move Pico's existing atomic breakdown into colocated `.part.tsx` files discovered by `dev-lab`.

**Requirements:** R6, R9

**Dependencies:** U1, U2

**Files:**
- Modify/Create: `product/surfaces/web/pico/**/*.atom.part.tsx`
- Modify/Create: `product/surfaces/web/pico/**/*.molecule.part.tsx`
- Modify/Create: `product/surfaces/web/pico/**/*.organism.part.tsx`
- Modify/Create: `product/surfaces/web/pico/**/*.template.part.tsx`
- Modify/Create: `product/surfaces/web/pico/**/*.page.part.tsx`
- Modify: `product/surfaces/web/pico/stories.tsx` or remove its lab dependency after migration
- Test: `tools/theme-workshop/lab/parts-discovery.test.ts`

**Approach:**
- Rename or wrap the existing Pico story specs into the new filename convention.
- Keep fixture-only rendering. Do not import routes, live atoms, RPC hooks, or network-backed data.
- Preserve current page-level entries from `PICO_SCREENS` as `.page.part.tsx` files or a small set of generated-compatible page part modules.

**Patterns to follow:**
- Existing `product/surfaces/web/pico/stories.tsx` and `product/surfaces/web/pico/ui/**/*.story.tsx` source material.
- `tools/theme-workshop/Parts.tsx` expectations for `surface` framing.

**Test scenarios:**
- Happy path: Pico parts discovery returns non-empty stories in all layers currently represented by the old catalog.
- Integration: `/lab/all/pico/parts` shows Pico pages and at least one atom/molecule/organism group.
- Error path: no Pico part performs live fetch/RPC during render.

**Verification:**
- The old Pico atomic breakdown is visible in `just dev-lab` at `/lab/all/pico/parts` with no adapter story manifest.

---

### U4. Add Shift parts coverage through the same convention

**Goal:** Make Shift's parts catalog first-class in `dev-lab` using `.part.tsx` files rather than Storybook-only CSF stories.

**Requirements:** R7, R9

**Dependencies:** U1, U2

**Files:**
- Create/Modify: `product/surfaces/web/shift/**/*.atom.part.tsx`
- Create/Modify: `product/surfaces/web/shift/**/*.molecule.part.tsx`
- Create/Modify: `product/surfaces/web/shift/**/*.organism.part.tsx`
- Create/Modify: `product/surfaces/web/shift/**/*.template.part.tsx`
- Create/Modify: `product/surfaces/web/shift/**/*.page.part.tsx`
- Test: `tools/theme-workshop/lab/parts-discovery.test.ts`

**Approach:**
- Convert the useful restored Shift Storybook story material into lab-native parts.
- Start with high-value components: `ShiftPill`, `ShiftTile`, HUD buttons/chips, search/menu/status molecules, home rail/top/bottom organisms, `ShiftHomeRoot`, cinematic home/page states, and game detail states.
- Use fixture data near the part files or existing dev media; do not route through live app atoms.

**Patterns to follow:**
- `product/surfaces/web/shift/atoms/ShiftPill.stories.tsx` and similar restored stories as migration source material.
- `product/surfaces/web/shift/config.tsx` fixture media mapping for page-level previews.

**Test scenarios:**
- Happy path: `/lab/all/shift/parts` renders Shift parts grouped by layer.
- Happy path: moving a part file between folders does not change its layer as long as the filename suffix stays the same.
- Edge case: page-level Shift parts are framed/sized so full-screen surfaces do not collapse.
- Error path: Shift parts do not import route files or live service atoms.

**Verification:**
- Shift has a useful first-class parts catalog in `dev-lab`, and Storybook is no longer the only way to iterate on atomic pieces.

---

### U5. Add a starter Boxbuster parts catalog

**Goal:** Give Boxbuster enough parts coverage to iterate design states in the lab, while avoiding premature mesh-level extraction.

**Requirements:** R8, R9

**Dependencies:** U1, U2

**Files:**
- Create: `product/surfaces/web/boxbuster/**/*.page.part.tsx`
- Create: `product/surfaces/web/boxbuster/**/*.organism.part.tsx`
- Create: `product/surfaces/web/boxbuster/**/*.molecule.part.tsx`
- Modify (only if useful): `product/surfaces/web/boxbuster/app.tsx`
- Modify (only if useful): `product/surfaces/web/boxbuster/scene.tsx`
- Test: `tools/theme-workshop/lab/parts-discovery.test.ts`

**Approach:**
- Start with coarse fixture-backed previews: full store TV off, full store TV playing, overlay HUD prompt states, and TV/console visual states if extractable.
- Extract tiny presentational seams only when a part cannot be rendered without duplicating significant implementation detail.
- Avoid turning every internal mesh into a public component just to satisfy taxonomy.

**Patterns to follow:**
- `product/surfaces/web/boxbuster/app.tsx` data-injectable `App` seam.
- `product/surfaces/web/boxbuster/boxbuster-catalog-view.ts` fixture/catalog `Game` shape.

**Test scenarios:**
- Happy path: `/lab/all/boxbuster/parts` renders at least one Boxbuster page/organism preview once part files exist.
- Edge case: Boxbuster parts can render with fixture games and no SteamGridDB/network fetch dependency.
- Error path: parts discovery ignores Boxbuster runtime files that are not suffixed as `.part.tsx`.

**Verification:**
- Boxbuster appears in the same lab parts workflow as Pico and Shift, even if its initial catalog is intentionally coarse.

---

### U6. Retire the temporary Pico-specific adapter hook

**Goal:** Remove the one-off `loadAtomicCatalog` adapter capability once generic discovery covers Pico.

**Requirements:** R1, R5, R6

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `tools/theme-workshop/lab/adapters/pico.ts`
- Modify: `tools/theme-workshop/lab/adapters/pico.test.ts`
- Modify: `tools/theme-workshop/lab/surface-registry.ts`

**Approach:**
- Delete adapter-owned parts loading from the Pico adapter.
- Keep adapter `screens` focused on runtime app paths unless the generic route bar appends `Parts` separately.
- Ensure tests would fail if a future adapter tries to own parts as a manifest again.

**Patterns to follow:**
- `tools/theme-workshop/lab/adapters/shift.ts` and `boxbuster.ts` runtime adapter shape.

**Test scenarios:**
- Happy path: Pico still exposes Parts through discovery after the adapter hook is removed.
- Edge case: adapters with no parts require no extra fields.

**Verification:**
- The adapter contract remains about mounting real surfaces; parts are discovered by the lab.

---

## System-Wide Impact

- **Interaction graph:** `dev-lab` route `/parts` -> parts discovery -> existing `Parts` renderer. Runtime surface mounting remains unchanged for `/` and `/game/$id` paths.
- **Error propagation:** Invalid part files should fail visibly during development/build; direct `/parts` with no files should render a helpful empty state.
- **State lifecycle risks:** Lazy dynamic imports must avoid setting state after unmount or surface switch.
- **API surface parity:** Pico, Shift, Boxbuster, and future surfaces get the same authoring convention.
- **Integration coverage:** Vite build is required because `import.meta.glob` behavior cannot be fully proven by pure unit tests.
- **Unchanged invariants:** Device calibration, route mirroring, and real surface mount/dispose behavior do not change for runtime paths.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Filename convention is too magical | Keep the convention narrow, documented in empty states and tests: `*.{layer}.part.tsx`. |
| Dynamic imports pull too much code into initial lab load | Lazy-load only on `/parts`; verify production build chunks. |
| Part files accidentally import live app/runtime dependencies | Add test/review expectations and keep fixtures colocated; do not import route files for page previews. |
| Shift migration revives obsolete rail-home code unintentionally | Convert only useful design states and keep runtime Shift surface untouched. |
| Boxbuster parts force premature scene refactors | Start coarse; extract only designable seams that pay for themselves. |

---

## Documentation / Operational Notes

- Add a short lab authoring note near the discovery module or lab README equivalent documenting: `ComponentName.atom.part.tsx`, default export, optional named variants, optional metadata.
- Update any references that currently point designers/developers to `dev-theme-workshop` for Pico parts so they point to `just dev-lab` and `/lab/all/pico/parts`.

---

## Sources & References

- Related code: `tools/theme-workshop/lab/components/LabStage.tsx`
- Related code: `tools/theme-workshop/lab/components/LabRouteBar.tsx`
- Related code: `tools/theme-workshop/Parts.tsx`
- Related code: `product/surfaces/web/pico/stories.tsx`
- Related code: `product/surfaces/web/shift/atoms/ShiftPill.stories.tsx`
- Related plan: `work/items/active/01KVXF5CGMQXZRAE27TZ3QHXRC-lab-multi-device-surface-routing/plan.md`
