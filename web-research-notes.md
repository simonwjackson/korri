# External Grounding: Korri Dev-Lab Design Workbench

**Research value: high** — Substantial prior art across all six research dimensions with directly applicable design choices, concrete performance numbers, and strong cross-domain analogies.

---

## Prior Art

### Component Workbenches: Beyond Storybook

**Storybook 10 (Vite mode)**
- https://storybook.js.org/
- Current state (2025): Storybook 10 with `@storybook/react-vite` is the dominant choice. Cold start 8s (vs 45s on Webpack), HMR ~2s. 1000+ addon ecosystem, visual regression via Chromatic, MDX docs, viewport addon.
- Fundamental architecture: Components are always rendered in isolation with a _decorator_ provider wrapping them. The data seam is `args` + `decorators` — swapping a service layer requires MSW or a decorator that stubs imports. No native "layer atom" concept.
- **What to steal**: The Storybook `play()` function + interaction panel is the closest external art for the "pin to state + inspect live transition" problem. CSF3 stories are just objects, allowing programmatic enumeration.
- **Critical gap that Korri fills**: Storybook's service swap is mock-at-transport (MSW, import stub). Korri's seam is an atom holding a `Layer` — swap happens at the Effect DI boundary, not the network boundary. No external tool implements this.

**Ladle**
- https://github.com/thetarnav/ladle (Uber)
- 6.7× faster cold start than Storybook (1.2s vs 8s), 5× faster HMR. Ships only React, uses Vite natively.
- **What to steal**: Its startup profile is worth benchmarking against. Pure Vite + no addon overhead = the performance floor for a similar in-repo lab.
- **Tradeoff**: No addon ecosystem, no docs mode, no viewport testing. Fine for quick component preview loops.

**Histoire**
- https://histoire.dev/
- Vue-first (by a Vue core team member), React support secondary. ~2s cold start. Has docs support and decent controls. Pre-1.0.
- Skip for React/Effect stack. Mentioned only to confirm there's no faster React-native option with Histoire's feature set.

**React Cosmos** ⭐ Most architecturally aligned
- https://reactcosmos.org/ — v7.3.0, 8.7k GitHub stars
- "A dev tool first, made to improve all components… not just the stateless UI bits."
- Core philosophy: **file-system-based fixtures** that define component states effortlessly, with a **proxy architecture** that intercepts context providers around the real component. No import mocks, no MSW. The seam is a configurable plugin/proxy that wraps the fixture.
- Supports Vite, Webpack, React Native, Next.js. Plugin system for extending all behavior.
- **What to steal**: Fixture-as-file-module convention for defining pinned states. The "proxy" pattern for intercepting the provider tree around a real component is structurally identical to Korri's `layerAtom` swap — React Cosmos proved this design works at scale.
- **Risk to watch**: React Cosmos fixtures are per-component; Korri dev-lab is a multi-component canvas. The proxy architecture gets complex when multiple placed parts each need independent layer overrides.

**Playroom (seek-oss)**
- https://github.com/seek-oss/playroom — 4.6k stars, npm v1.2.2 (active, 2 months ago)
- "Simultaneously design across a variety of themes and screen sizes, powered by JSX and your own component library."
- Architecture: single JSX editor, renders real components into N iframes — one per (theme × width) combination. Each iframe has a `FrameComponent` wrapper (= the provider/layer seam). Theming/width are first-class config axes.
- `frameSettings`: per-frame boolean toggles (e.g. RTL, show-touch-targets) — these are independent per-frame, session-only, not persisted in URLs.
- **What to steal**: The (theme × width) matrix as a first-class canvas of simultaneous live instances is exactly the "device objects on canvas" pattern. `FrameComponent` is the right abstraction for "each placed part gets its own layer/provider context." The multi-iframe approach sacrifices performance for isolation — note this tradeoff.
- **Warning**: Playroom uses an iframe per frame. With N device objects × M part objects, iframe overhead accumulates. React Cosmos and Storybook both share this problem. Korri's in-process layer-atom approach avoids iframes but means components share a React tree — cross-component context bleed is a real risk.

---

## Effect / @effect/atom-react Layer-Swapping Patterns

**EffectPatterns community knowledge base**
- https://github.com/PaulJPhilp/EffectPatterns — 770+ stars, 300+ patterns, live browser playground at EffectTalk.dev
- Directly relevant patterns:
  - **"Create a Reusable Runtime from Layers"** (Advanced): Compile layers into a `Runtime` object to efficiently execute multiple effects sharing the same context — maps exactly to the lab's idea of each placed-part getting its own `Runtime` built from an overridden `layerAtom`.
  - **"Understand Layers for Dependency Injection"** (Intermediate): A `Layer` is a blueprint that describes how to build a service, detailing its own requirements. `Layer.succeed(Service, value)` is the harness seam.
  - **"Modeling Tagged Unions with Data.case"**: Effect's `Data.case` for ADTs over `_tag` — same shape as Korri's `LibraryListState` / command ADTs.
- **Critical gap**: No published examples of Effect layers used as a Storybook/design-preview harness. The pattern exists in Effect's own testing docs but has not been productized in a design-tool context. Korri's `layerAtom` pattern appears to be novel prior art — no external precedent found.
- **What to steal**: The `Runtime` compilation approach confirms that per-placed-part `Runtime` objects are the right model. Each device object on the canvas carries its own compiled `Runtime`, sharing the outer canvas's `ManagedRuntime` only for non-part concerns (routing, navigation).

**Effect v4 atom-react**
- `@effect/atom-react` has no community design-tooling write-ups indexed as of mid-2026. The library's harness seam (`layerAtom` holding the current `Layer<Service>`) is documented in Effect's own docs but not discussed externally in design-workbench contexts.

---

## Infinite-Canvas Libraries: Tldraw vs xyflow

**tldraw SDK** ⭐ Best for free-canvas design tool
- https://tldraw.dev — MIT (with attribution), React 18+, active in 2026
- Performance model (from docs):
  - **Viewport culling**: 10k shapes → renders only ~50 in viewport. Off-screen shapes get `display: none`, still in store. Automatic for all shapes, configurable per custom ShapeUtil via `canCull()`.
  - **Reactive signals** (not React state): Dependency-tracked, granular. Changing one shape's color does not re-render other shapes.
  - **Batched store updates**: `editor.run()` collapses multiple mutations into one observer notification.
  - **Debounced zoom**: `getEfficientZoomLevel()` — stable value during camera movement for shapes >500. Critical for continuous animation avoidance.
  - Default `maxShapesPerPage: 4000`, configurable to 10k+.
- Custom shapes: `ShapeUtil.component()` renders arbitrary React JSX including full hooks. `HTMLContainer` = div with special CSS for hit testing. Geometry is cached, only invalidated on prop change.
- **Portal shapes** example: `BaseFrameLikeShapeUtil` allows custom frame-like shapes that accept children via drag-and-drop and clip contents. Pairs of portals linked by ID — dragging into one teleports to other. This is the right primitive for "placed part object" frames.
- **Persistent iframe shape** example: A custom shape that keeps an iframe alive across camera moves. Directly applicable to isolating per-placed-part context.
- **Inspector panel** built-in UI slot: `tldraw` has a first-class Inspector panel UI zone replaceable with custom React — no need to build it from scratch.
- **Warning**: Custom shapes with full React components inside lose tldraw's signal-level optimization — they still trigger React reconciliation on every re-render of their own subtree. Use `React.memo` aggressively. Expensive component trees inside shapes will degrade canvas pan/zoom.
- **Warning**: Continuous animations (spinning, pulsing) inside shape components trigger per-frame re-renders. Use CSS animations for visual effects that don't change shape data.
- `PerformanceManager` API: subscribe to `interaction-end`, `camera-end`, `shapes-created` events for telemetry. Wires into Chrome DevTools via `PerformanceApiAdapter`.

**xyflow / React Flow v12**
- https://xyflow.com/ — Better for node-graph (edge/connection) UIs.
- Performance: Memoize custom node components (`React.memo`), memoize handlers (`useCallback`), avoid reading full `nodes` array in components.
- **Tradeoff vs tldraw**: xyflow is node-based-UI-first; tldraw is free-canvas-first. For Korri dev-lab (devices + parts on a canvas, not a DAG), tldraw is the better fit. xyflow is worth considering if the part-wiring/connection graph becomes a primary surface.

**Excalidraw**
- Sketch-style freehand canvas. Open source but not designed as an embeddable SDK for custom shapes. Ruled out for embedded React component shapes.

---

## Multi-Screen / Device Preview Patterns

**Existing React libraries**: `react-device-frameset`, `react-device-emulator` — both last updated 3+ years ago. No active mm-accurate device framing library found in 2024-2026.

**Playroom's approach** (most relevant active prior art): Config-driven `widths: [320, 768, 1024]` creates a horizontal stack of iframes, each with an independently resizable viewport. Themes × widths = a matrix of live instances. Per-frame labels show current width.

**Browser DevTools emulation**: Precise viewport simulation but not embeddable in a React canvas. Not applicable.

**mm-accurate device framing insight**: The industry approach is to:
1. Know the device's physical screen dimensions in mm (device spec).
2. Know the device's pixel density (PPI).
3. Compute CSS px from physical mm: `mm_to_px = (device_ppi / 25.4) * mm`.
4. Render the component at that exact CSS pixel size inside a scaled container.
No published React library does this well for game handhelds (Odin, RG, etc.). Korri's lab is novel in the handheld-gaming-device-as-first-class-preview context — no prior art found.

---

## State-Machine Driven UI Catalogs

**XState / Stately**
- https://stately.ai, https://xstate.js.org
- XState v5 (stable 2024): actor model, `createMachine`, `setup()` pattern for typed actions/guards.
- Stately editor: visual state machine designer with GitHub sync. No auto-Storybook story generation shipped.
- `@statelyai/agent`: LLM + XState actor integration — unrelated to UI catalog.

**`storybook-state-addon`** (niche)
- https://storybook.js.org/addons/storybook-state-addon
- 11 downloads/week — essentially unmaintained. Takes a `stateMachine` array in story parameters (objects of args for each state). Manual enumeration, not derived from machine definition.

**Market gap confirmed**: No tool auto-derives Storybook stories from XState machine state definitions (or tagged-union variants). The closest is:
- Manually writing one story per machine state (common practice).
- Using `@statelyai/inspect` to visualize running actors — but this is runtime inspection, not a static catalog.
- **What to steal**: The pattern of enumerating machine states and feeding each as a story `args` object is the missing primitive. For Effect tagged unions, the `_tag` set is enumerable at type level — a codegen step could produce fixture files from the ADT definition. No external tool does this; Korri would pioneer it if implemented.

---

## Cross-Domain Analogies

### Unity Edit/Play Mode Split ✅ Strong structural match
- Unity has two distinct operational modes sharing the same scene graph: **Edit mode** (static composition, inspector shows serialized property values) and **Play mode** (live runtime, inspector shows live values that change in real time).
- Switching modes reloads all `MonoBehaviour.Start()` — i.e., the service initialization path runs fresh.
- Korri dev-lab's **Inspect axis** (static state pinned to a tagged-union case, fixture data) vs **Live axis** (real Effect runtime, real atoms) maps exactly to Unity's Edit/Play split. The structural constraint is identical: a placed part in Inspect mode shows a frozen snapshot; the same part in Live mode runs a real `ManagedRuntime`.
- **What to steal**: Unity exposes "configurable enter Play mode" — you can skip domain reload to make the switch faster. Korri could do the same: Inspect→Live transition should not remount the whole canvas, only the affected placed part.

### DAW Rack View ✅ Spatial + per-unit state model
- A DAW rack is a canvas of processing units (EQ, compressor, reverb) each with its own state (settings, bypass, metering). Units can be rearranged spatially. Signal flows through them in order.
- Korri dev-lab "placed part objects" on a device canvas are structurally identical rack units: spatial, independent state, ordered rendering, reorderable. The device canvas = the rack frame.
- **What to steal**: DAWs show per-unit state meters inline with the rack unit (real-time dB meters). Korri's "Live" axis can show real-time atom values inline with each placed part — not just in a separate inspector panel.

### CAD Viewport + Inspector Panel ✅ Selection-driven inspector
- CAD tools (Fusion 360, FreeCAD): select a geometry → inspector updates to show exact dimensions, material, constraints. The inspector is always slave to the selection.
- Korri dev-lab inspector should be slave to the canvas selection, not statically bound to a single part. This is an obvious design but worth codifying: selected placed part → inspector tab updates.
- **What to steal**: CAD tools distinguish between "edit this parameter" (enters an inline edit mode on the canvas shape) and "inspect" (read-only panel). Korri's Inspect/Live toggle maps to the same distinction.

### Game Engine Level Editor Canvas
- Level editors (Unity, Godot, Unreal): a canvas of "placed objects" (sprites, actors, lights) where selecting an object opens its component tree in an inspector. Objects can have the same prefab type but different instance properties.
- The "device object" / "placed part object" distinction in Korri dev-lab is structurally identical: a device object = a prefab/scene; placed part objects = instances of component prefabs placed inside the scene.
- **What to steal**: Prefab-instance editing model — a placed part inherits defaults from the part definition but can have instance-level overrides. Unity's prefab override system (property overrides shown in bold, with a "revert to prefab" affordance) is the right model for Korri's placed part overrides.

---

## Market and Competitor Signals

| Tool | Posture | Where Korri Differs |
|---|---|---|
| Storybook 10 | Industry standard; isolation via mocks/MSW; 10M/week downloads | Korri uses real Effect layers, not import mocks |
| Ladle | Speed-first, React-only, no ecosystem; 40k/week | No canvas, no multi-device |
| React Cosmos | Real components, proxy architecture, file-system fixtures | No canvas; single component at a time |
| Playroom | Multi-viewport JSX canvas, iframe-per-frame, theme × width | No Effect layer model; no state-machine axis |
| tldraw SDK | Best-in-class canvas primitives, active SDK | Canvas only — no component workbench semantics |
| Stately/XState | Actor visualization, no auto-story-gen | No design workbench; inspection is runtime-only |
| Framer | Design-to-code with code components, full website builder | Proprietary; not in-repo; no Effect runtime |

**Direction signal**: The market is fragmenting toward in-process harnesses with real data (React Cosmos, Effect layers in tests) away from mock-at-transport (MSW in Storybook). The "real component + configurable data seam" philosophy is gaining ground. Korri dev-lab is ahead of the external market on the Effect-specific implementation.

**Chromatic modes (2024)**: Chromatic added "story modes" — run a story in multiple theme/viewport configurations automatically without writing N stories. This is the Chromatic response to the Playroom/multi-frame problem. Relevant if Korri dev-lab needs a CI-side visual regression path.

---

## Risks and Warnings (from External Sources)

1. **tldraw + live React in shapes**: tldraw's performance optimizations (signals, culling) do not extend inside custom shape `component()` bodies. A live Effect atom subscription inside a placed-part shape will trigger standard React re-renders for that shape on every atom tick. With many live parts, this can cause jank during canvas pan/zoom. Mitigation: `React.memo`, `useAtomValue` with fine-grained selectors.

2. **Iframe isolation vs in-process context**: Playroom and React Cosmos both use iframes (or sandboxed workers) for strong isolation between fixture instances. In-process (Korri's approach) is faster but risks React context bleed between placed parts if their providers are not carefully scoped. Each `PartRoot` must create its own provider subtree with no shared context below the canvas level.

3. **tldraw `maxShapesPerPage` ceiling**: Default 4k, configurable to 10k. A dev-lab with many devices × many parts could approach this if shapes are fine-grained. Prefer one shape per placed part (not per sub-element of the rendered component).

4. **Multi-viewport iframe overhead**: Playroom's benchmark suggests ~1 iframe per frame is feasible for a handful of devices but scales poorly. For Korri dev-lab with 4+ device objects × 5+ placed parts, an all-iframe approach would have ~20 iframes — avoid this.

5. **State-machine auto-catalog**: No prior art means no community validation of the "derive stories from tagged-union definition" approach. The risk is that ADT members don't have sufficient fixture data attached to them — the generator needs default fixture factories per `_tag`, which is a separate contract to maintain.

6. **Device mm-accuracy**: CSS `px` is not 1:1 with physical mm on most displays. A "mm-accurate" device frame requires knowing the host display's DPI (available via `window.devicePixelRatio` × OS DPI — not easily reliable). For a dev-lab used on developer machines, accept "approximately correct at design DPI (96 dpi)" and document the caveat.

---

## Sources

| URL | Description |
|---|---|
| https://reactcosmos.org/ | React Cosmos v7.3 homepage — fixture/proxy architecture and design philosophy |
| https://dev.to/themachinepulse/storybook-10-why-i-chose-it-over-ladle-and-histoire-for-component-documentation-2omn | Detailed 2025 comparison: Storybook vs Ladle vs Histoire with measured cold-start and build times |
| https://github.com/seek-oss/playroom/blob/master/README.md | Playroom README — simultaneous multi-frame JSX canvas, FrameComponent, frameSettings |
| https://tldraw.dev/sdk-features/performance | tldraw SDK performance guide — viewport culling, reactive signals, debounced zoom, PerformanceManager |
| https://tldraw.dev/examples/custom-shape | tldraw custom shape example — ShapeUtil.component() renders full React JSX |
| https://tldraw.dev/examples/shapes/layout/portal-shapes | tldraw portal shapes — BaseFrameLikeShapeUtil, frame-child teleportation |
| https://github.com/PaulJPhilp/EffectPatterns | Effect Patterns community knowledge base — 300+ patterns including Layer DI and Runtime compilation |
| https://reactflow.dev/learn/advanced-use/performance | React Flow performance guide — memoization strategies for large graphs |
| https://storybook.js.org/addons/storybook-state-addon | storybook-state-addon — manual state-machine array in story parameters (niche, 11 downloads/week) |
| https://stately.ai/docs/xstate | Stately/XState docs — state machine actor model, no auto-story-gen |

---

*Generated: 2026-07-03. Research coverage: component workbenches, Effect layer patterns, infinite canvas, device preview, state-machine catalogs, cross-domain analogies.*
