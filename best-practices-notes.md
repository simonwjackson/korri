# Dev-Lab Design Tool: External Best-Practices Research Digest

> **Scope**: Industry best practices relevant to Korri's dev-lab (`just dev-lab` / `theme-workshop`), the in-repo design workbench that renders real production React components and swaps only data at the Effect source-layer atom edge. Governing principle: **"the tool is the app unwrapped, never a simulation."**
>
> **Research date**: 2026-07-03  
> **Methodology**: Skills review → deprecation check → primary source web research (React Cosmos, Storybook 10, Ladle, Histoire, Playroom, Stately Inspector, tldraw, React Flow / @xyflow/react, Responsively App, Polypane, Chromatic)

---

## (a) Comparable Tools — Pattern Contribution Table

| Tool | Stars (approx.) | Core pattern relevant to dev-lab |
|---|---|---|
| **React Cosmos** | 8.7k | Fixture = real component + decorator-as-provider. `useFixtureInput` / `useFixtureSelect` for control-panel inputs without coupling to props. Plugin architecture for full-stack extensibility. Never mocks; real implementations with configurable behavior. |
| **Storybook 10 (CSF 3)** | 90k+ | Component Story Format: declarative `args` + `render`, stacked `decorators`, `play` functions for interaction testing. Addons ecosystem. `parameters.viewport` for responsive framing. Discovery via static title or filesystem glob. |
| **Ladle** | Vite-native alt | Drop-in Storybook alternative, 20× smaller bundle, immediate HMR. Demonstrates that a fast Vite-native story runner can be a lean inner loop without the addon ecosystem weight. |
| **Histoire** | Vite-native alt | Variant grids (all states at a glance), Tailwind auto-detection, idiomatic framework-native syntax (`.vue`, `.svelte`). Demonstrates "grid of all named variants" as a first-class view. |
| **Playroom (seek-oss)** | 4.6k | Live JSX-in-browser scratchpad wired to your real component library. Multi-theme × multi-width matrix framing from a single code snapshot. `FrameComponent` wraps real providers — no mocking. URL-shareable states. |
| **Stately Inspector** | — | Universal state-machine visualization for live running actors. Connects to XState actors via `@statelyai/inspect`; derives state-machine diagram and sequence diagram from the machine definition. "Send event to actor" for bidirectional control from the inspector panel. Real-time snapshot observation. |
| **tldraw SDK** | 40k+ | Production-grade infinite canvas primitives: camera model (x/y/scale), signal-driven store, shape/frame types, pinch-to-zoom, Minimap, culling, undo/redo stack, pointer capture patterns. Demonstrates clean separation of pan translate and zoom layers. |
| **React Flow / @xyflow** | — | Node-based canvas layout: `ReactFlowProvider`, `useReactFlow()`, viewport API. `fitView`, animated camera transitions, `NodeToolbar`, frame shapes, sub-flows. Alternative to free-form canvas when you need edge routing and hierarchy. |
| **Responsively App** | 20k+ | Multi-device side-by-side preview, mirrored pointer/scroll interactions across frames, device profiles library, unified DOM inspector across all frames simultaneously. |
| **Polypane** | — (commercial) | Multi-viewport browser, synchronized scroll + interaction, per-frame dark-mode/media emulation, accessibility auditing per pane. "Every breakpoint visible and synchronized" as first-class UI. |
| **Chromatic** | — (service) | Pixel-level visual regression: stories → snapshots → diffing. TurboSnap: only re-snapshot stories whose dependency graph changed. Teaches: the story/fixture set IS the visual test suite; never maintain a separate list. |

---

## (b) Concrete Recommendations — Mapped to dev-lab Philosophy

### B1. Preserve the "real-edge, no-mock" contract (React Cosmos alignment)

React Cosmos's architectural documentation explains its uniqueness this way: *"Library over framework — instead of replicating all the environments it operates in, React Cosmos functions as a modular library that can be seamlessly integrated into any environment."* Its fixture model renders the **real component** inside a real React tree, with **decorators** wrapping providers — identical to the dev-lab's `LabPartMount` + surface adapter pattern.

**Recommendation**: The current `surfacePartMount` → `partRegistryRoot` → scoped `AtomRegistry` path is already the right shape. When adding a new surface adapter, resist any temptation to render a "studio-only" version of the component. The boundary test (`lab-boundary.test`) is the right enforcement mechanism and should be extended when new surfaces are added.

React Cosmos `useFixtureInput` is a useful mental model: the control-panel input mutates a shared value that the fixture reads, which is exactly what `LabSurfacePartInput.apply` does. The naming and vocabulary (`apply` / `release` on an input, `emit` on an event) are stronger than Cosmos's hook-based model because they compose across object scopes.

### B2. Derive state vocabulary from machine tags — never hand-list

Stately Inspector's entire value proposition is the same insight already baked into the dev-lab: the state machine definition is the source of truth for which states exist. Inspector generates both the state-machine diagram and the sequence diagram from that definition. The `@statelyai/inspect` package calls this "actor creation events" + "snapshot changes."

The dev-lab already encodes this as `axisOptionsFromTags(Machine.tags)` and `stateMachine([...tags]).tags`. This is the correct pattern.

**Extension opportunity**: Stately Inspector adds **bidirectional communication** — sending events _from_ the inspector _into_ the running actor. The dev-lab already has a one-directional version of this (`LabSurfaceEvent.emit`), but the coupling is loose: the emitted event must be declared in the surface adapter. A potential enhancement is a "fire an arbitrary event by name" escape hatch (equivalent to Stately's event panel) that lists all valid XState transition event types from the machine definition itself, so new transitions in the machine automatically appear in the lab without adapter changes.

### B3. Infinite canvas: maintain the clean translate + zoom layer separation

The dev-lab's canvas already implements the key insight documented in `LabWorkshopBoard.tsx`:

```
Outer div  = translate only  (pan in device px)
Inner div  = zoom only       (CSS `zoom:` so text re-renders at real size, not bitmap-scaled)
```

tldraw uses an identical layering and documents the same rationale. All production infinite-canvas tools agree: mixing translate and scale on the same element causes anchor drift on every wheel/pinch event because the translate is itself scaled.

**Recommendations from tldraw and React Flow**:

1. **Minimap** — When many placed parts fill the canvas, a minimap (small thumbnail of the full canvas extent with a viewport rect overlay) gives spatial orientation without breaking the editing flow. Both tldraw and React Flow implement this as a separate portal-rendered overlay. The cost of implementing a read-only minimap (render SVG rects from `objectBounds()` data) is low.

2. **Culling / visibility gate** — tldraw only renders shapes whose bounding box intersects the visible viewport. The dev-lab renders all `objects` unconditionally. As the number of placed parts grows (design pass with 50+ variants), this will degrade. A simple `isRectFullyVisible`-style filter before the `.map()` in `LabWorkshopBoard` would gate rendering of off-screen `LabDraggablePart` instances.

3. **Camera persistence** — tldraw persists the camera per-document. The dev-lab persists `devices` and `knobs` via `localStorage` but resets the camera on reload. Persisting `camera` alongside `devices` in `labStorageKey(adapter.id) + ':lab'` would preserve the user's view across sessions.

4. **Keyboard shortcut surface** — tldraw documents: `Space` = hand, `Ctrl+Z` = undo, `F` = fit. The dev-lab has `Space` for hand and zoom commands via `LabWorkshopCommandSignal`. Documenting and testing the full keyboard surface (a `shortcuts` section in the lab chrome or a `?` overlay) reduces discoverability friction.

### B4. Physical-device framing is already stronger than Responsively/Polypane — extend, don't replace

Responsively and Polypane both work via CSS viewport simulation (`@media` widths). The dev-lab's `pxPerMm` calibration + `DeviceConfig` (width/height in mm, real bezel rendering) is fundamentally more honest for handheld hardware because:
- It renders at the real physical pixel density of the monitor, not a simulated viewport
- Multi-screen device layout (primary + companion screen with placement relationships) has no equivalent in Responsively or Polypane
- Bezel/frame rendering is device-specific, not generic "phone frame"

**From Responsively/Polypane, one pattern is missing**: **mirrored pointer interactions across all live device objects simultaneously**. Responsively mirrors every click, scroll, and navigation to all frames in real-time. The dev-lab currently lets each live device object run independently. For testing that a navigation or state change applies consistently across all frames (e.g., all three Shift devices showing the same catalog state), a "broadcast pointer" mode would be valuable.

**Polypane lesson**: Per-pane **media feature emulation** (`prefers-color-scheme`, `prefers-reduced-motion`, `forced-colors`) as toggles in the device inspector panel. These are real CSS media features, not tool-only switches. The dev-lab could expose per-device-object `data-*` attribute toggles that change which CSS variables apply.

### B5. Variant grids as a first-class view (Histoire pattern)

Histoire's most distinctive contribution is the **variant grid**: a single canvas showing every named state of a component simultaneously, each labeled with its state name. This is exactly what the dev-lab's `LabGalleryView` already does.

**Enhancement from Histoire**: The grid view should show the **state label visually inside or above each frame**, not just in the sidebar. When printing or screenshotting the design pass, the state name on each card makes the grid self-documenting without requiring knowledge of grid order.

Histoire also auto-generates a **copyable code snippet** for each variant. For the dev-lab, a "copy mount spec" action (the `LabSurfacePartMountSpec.initialValues` for the current binding) would let a developer reproduce a specific lab configuration in a test.

### B6. Story/part discovery: keep the glob convention narrow and stable

Storybook's static analysis depends on stable title conventions. React Cosmos uses the `*.fixture.{jsx,tsx}` convention. The dev-lab uses `*.{atom,molecule,organism,template,page}.part.tsx` — a richer taxonomy embedded in the filename.

The key lesson from both: **the discovery glob is a contract**. When it changes, all existing files must be renamed, and any tooling that generates part files (AI takes, design passes) must be updated simultaneously.

**Recommendation**: The `PART_PATH` regex in `parts-discovery.ts` is the canonical contract. Make it explicit in documentation:
```
<surfaceId>/<any/path>/<BaseName>.<atom|molecule|organism|template|page>.part.tsx
```
Any deviation (e.g., an `.ai-takes/` exclusion) should be documented inline with the regex, not just guarded by a path-contains check.

### B7. Storybook decorators vs. dev-lab `surfacePartMount` — choose the right abstraction level

Storybook's `decorators` array wraps a story in arbitrary providers, which is the right model for lightweight theme/i18n providers. For Effect-backed surfaces, the `surfacePartMount` spec (with `initialValues` seeded into a fresh `AtomRegistry`) is a stronger contract because:
1. It is typed — `LabPartSeedEntry[]` carries the actual atom types
2. It is scoped — each placed part gets its own registry, so multiple instances don't share atoms
3. It supports selective re-seeding (`reseedKeys`) so editing one input doesn't roll back event-driven facts

**When extending the adapter contract**: Only reach for `decorators`-style wrapping (`previewScope`) for CSS class scope or token context. All stateful data flows through `surfacePartMount`. This is already the rule; document it explicitly in the surface adapter interface.

### B8. Playroom "design in code" as a complementary mode

Playroom (seek-oss) takes a different approach: instead of file-based fixtures, it gives you a JSX editor inside the browser. You write JSX wired to your real components and see the output across themes and widths simultaneously. State is encoded in the URL.

This model is orthogonal to the dev-lab's placed-part canvas, but useful for:
- **Rapid throwaway explorations** that don't deserve a `.part.tsx` file
- **Sharing a specific composition** with a designer via URL
- **Testing cross-component compositions** (e.g., "what happens when a GameCard appears inside a GameRow inside a ShiftHomeSection?")

Playroom's `frameComponent` maps to the dev-lab's `previewScope` + `partRegistryRoot` pattern: it wraps the JSX output in the real providers. The key insight is that the rendered output is still real code — the JSX editor is a composition root, not a mock surface.

**Consideration**: A lightweight "scratchpad part" that accepts JSX strings (or even a Tiptap/CodeMirror editor) and mounts them through the real `LabPartMount` path could serve a Playroom-like workflow without a separate tool.

---

## (c) Anti-Patterns to Avoid

### AP1 — Preview-only branches (`preview ?? live`)

The most damaging harness drift mechanism. When production code carries a branch that only the dev-lab ever exercises (`if (isPreview) { ... }`), you ship dead code, the real path degrades over time without anyone noticing, and the tool no longer represents the app.

The dev-lab's AGENTS.md correctly identifies the remaining `preview ??` singletons as transitional debt. **Never introduce new preview branches; eliminate existing ones on each surface migration.**

*Observed in*: Most Storybook tutorials show `import { useMyHook } from './useMyHook'` replaced with `import { mockMyHook as useMyHook }` inside a story file. This is acceptable at the story boundary (composition root), but catastrophic if the swap happens inside the component or its real module.

### AP2 — Props drilling state into the harness

Storybook's args model encourages `<Button isLoading={true} />` to demonstrate a loading state. This tests the prop but not whether the real state machine ever reaches that `loading: true` condition via normal data flow. If the real app reaches loading state by waiting for an RPC response, the prop-drilling approach can't catch a regression where the RPC path bypasses the loading state.

The dev-lab's axis pin approach (swap the source atom that the route already reads) is superior because it exercises the real consumer path. **Prefer atom swaps over prop injections for state that is owned by the runtime.**

### AP3 — Mock-based network interception in the harness

MSW, `vi.mock()`, and `globalThis.fetch` swaps all work at the network layer rather than the data edge. The dev-lab's `lab-boundary.test` enforcement is the correct guardrail: if a part requires network activity to render in the lab, the part has a layering bug — fix the layer, not the harness.

Chromatic's documentation says the same thing: "If a component requires a live backend to appear in Storybook, it has a layering bug." The dev-lab's Effect layer swap is the correct seam; network-level interception is never appropriate.

### AP4 — Boolean prop permutation explosion

Without a state machine source of truth, each `isLoading | isError | isEmpty | isDisabled` combination must be hand-listed in the story/fixture catalog. For N independent booleans, that's 2^N states to enumerate. The tagged-union + `Machine.tags` approach reduces this to N named states that the machine actually defines.

**Rule**: If a component has more than three boolean props that affect layout or content, the state should be modeled as a tagged union before the component renders. The dev-lab's axis system is the enforcement mechanism — it can only expose states that exist as machine tags.

### AP5 — Maintaining a separate state vocabulary for the design tool

A common error: the design tool lists `["Loading", "Ready", "Error"]` while the actual machine has `["Idle", "Loading", "Ready", "LoadError", "Defect"]`. The discrepancy accumulates silently until someone builds UI that never exercises `Idle` or `Defect`.

**Rule**: `axisOptionsFromTags(Machine.tags)` and `stateMachine([...tags]).tags` are the only correct origins for state labels in the lab. If a new machine state is added (e.g., `Timeout`), it automatically appears in every axis that derives from `.tags`. Nothing in the lab's UI layer should hand-maintain a copy of a machine's case set.

### AP6 — Global atomic design taxonomy folders

Creating top-level Storybook folders `Atoms/`, `Molecules/`, `Organisms/`, `Templates/` breaks ownership: you cannot tell from the path which product or surface owns a component, and cross-surface naming collisions are invisible until the sidebar is full.

The dev-lab's `surfaceId + layer` path (`shift/atom/StatusBadge`) is the correct ownership-first approach. This matches the Storybook hierarchy rule from the lattice stack: `<Product>/<Feature>/<AtomicLayer>/<Component>`.

### AP7 — Static re-implementation of pages in the design tool

The worst form of harness drift: writing a "lab version" of a page that re-implements layout or state behavior. This is a second mechanism at the render layer. The dev-lab's one-renderer rule ("the lab always renders the real page — the same component production renders") is the correct stance.

If adding a page to the lab requires writing any rendering logic that isn't already in the production component, stop — the production component needs the real edge first.

### AP8 — Canvas-level viewport simulation instead of container queries

Responsively and Polypane work by resizing the browser viewport or injecting media query overrides. For TV/handheld UI where components must respond to their physical container dimensions (not to the viewport), viewport simulation gives false positives.

The dev-lab's physical-mm approach renders at the actual device resolution within the container, which exercises real `@container` queries rather than simulated `@media` breakpoints. Never regress to viewport-based preview for components that are specified in terms of their container.

### AP9 — Storing camera / calibration state in sources of truth outside localStorage

The dev-lab stores `pxPerMm`, `devices`, and `knobs` in `localStorage` under `lab-${adapterId}:lab`. This is the correct scope: non-sensitive local preferences at a documented storage seam. The lattice stack's rule allows this use case explicitly.

**What not to do**: Store lab calibration in the git-tracked config, which would conflict across workstations with different physical monitor densities. Each developer's physical display has a different `pxPerMm`.

### AP10 — Lazy story registration without a boundary test

React Cosmos's "lazy mode" and Storybook's dynamic imports both defer fixture loading to avoid bundle bloat. The dev-lab already implements this with `import()` in `partModules()`. The risk is that a part file with a parse error silently fails to appear in the catalog.

**Pattern from the dev-lab**: The `errors` array in `LabPartsCatalog` correctly surfaces per-path load errors rather than swallowing them. Always surface errors from the glob loader; never fail silently to an empty list.

---

## (d) Citations and Links

### Primary sources

| Source | URL | What it documents |
|---|---|---|
| React Cosmos docs | https://reactcosmos.org/docs/ | Fixture modules, fixture inputs, decorators, architecture |
| React Cosmos fixture inputs | https://reactcosmos.org/docs/fixtures/fixture-inputs | `useFixtureInput`, `useFixtureSelect` |
| Storybook 10 — Writing Stories | https://storybook.js.org/docs/writing-stories | CSF 3, args, decorators, play functions |
| Storybook — Why Storybook | https://storybook.js.org/docs/get-started/why-storybook | Component-driven philosophy, story isolation |
| Ladle docs | https://ladle.dev/docs/ | Vite-native lightweight Storybook alternative |
| Histoire guide | https://histoire.dev/guide/ | Variant grids, Vite-native, Tailwind auto-detection |
| Playroom (seek-oss) | https://github.com/seek-oss/playroom | JSX design tool, multi-theme framing, FrameComponent |
| Stately Inspector | https://stately.ai/docs/inspector | `@statelyai/inspect`, actor inspection, bidirectional events |
| Stately Inspector blog | https://stately.ai/blog/2024-01-15-introducing-stately-inspector | Introducing universal state inspection |
| tldraw SDK docs | https://tldraw.dev/docs/ | Infinite canvas primitives, camera model, shapes |
| React Flow (xyflow) | https://reactflow.dev/learn | Node-based canvas, viewport API, React integration |
| Responsively App | https://responsively.app/ | Multi-device preview, mirrored interactions |
| Polypane | https://polypane.app/ | Multi-viewport browser, synchronized scroll, a11y auditing |
| Chromatic docs | https://www.chromatic.com/docs/ | Visual regression capture, TurboSnap, story-as-test |

### Internal references

| Document | Path | Relevance |
|---|---|---|
| dev-lab AGENTS.md | `tools/theme-workshop/lab/AGENTS.md` | State axes, part-first invariants, seam contract |
| theme-workshop AGENTS.md | `tools/theme-workshop/AGENTS.md` | First principle, two object types, one-renderer rule |
| Lab parts are the app | `docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md` | Part-first migration playbook |
| React SKILL.md | `.pi/git/github.com/simonwjackson/pi-lattice-stack/skills/react/SKILL.md` | `stateMachine([...tags])`, state galleries, atomic composition |

---

## Quick-Reference: Decision Rules for Dev-Lab Extensions

| Situation | Correct approach |
|---|---|
| New surface needs lab support | Implement `LabSurfaceAdapter`; mount via `surfacePartMount` or `mountSurface`; never add a preview branch to production code |
| New state machine / new screen | Add `LabStateAxis` in `adapters/<surface>-axes.tsx`; derive options from `Machine.tags`; never hand-list states |
| Want to expose a new "knob" | Implement as `LabSurfacePartInput` with real `apply`/`release`; tie it to the atom the production surface already reads |
| Want to fire a device event | Implement as `LabSurfaceEvent` with `emit`; route into the surface's real event pipeline |
| Need a gallery of all states | Derive the state list from `.tags`; render each as a placed part or gallery cell; do not maintain a hand-authored list |
| Canvas performance degrades | Add a viewport-intersection guard before `objects.map()` in `LabWorkshopBoard`; only render objects whose `objectBounds()` intersects the camera view |
| New designer wants quick exploration | Consider a Playroom-style "scratchpad" placed-part that mounts arbitrary JSX through the real `LabPartMount` path |
| Multiple live devices should sync | Add a "broadcast pointer" mode that mirrors pointer/navigation events from the active device to all other live device objects |
| Component needs a new state but fails the boundary test | The production component needs a real atom edge for that state first; the lab follows, it does not lead |
