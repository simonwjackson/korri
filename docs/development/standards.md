# Development Standards

Project-agnostic rules for how to structure, layer, and verify code. Project-specific paths, file names, and tooling commands live in the project's `AGENTS.md`.

## Layering

Reusable layers must not depend on product-specific code.

- Code in shared themes, design systems, primitives, and SDKs MUST NOT import from product-specific layers (routes, RPC clients, feature wiring, transport hooks).
- Pages and templates compose Roots; they MUST NOT pick Roots. The composition root — route component or story — is where data strategy is chosen.
- A reusable module that only works inside one app is mislabelled. Either narrow its scope or move it into the product.

## Imports and boundaries

- Use product aliases for cross-folder imports inside a product.
- Use shared aliases only for genuinely shared runtime code.
- No barrel exports, except explicitly documented package/module entrypoints that define a public import surface.
- One project alias per layer. Do not introduce ad-hoc aliases (`~/*`, `#/*`, `$/*`, `@/*`).

## Testing posture

- Tests exercise real implementations of contracts with deterministic configuration.
- No `Mock*` / `Stub*` / `Fake*` classes in test or production code.
- Real subprocess + controlled exit code; real filesystem in temp dirs; real in-process server. The "fakeness" is in the configuration, not the type name.
- Test fixtures expose configurable knobs (`behavior`, `seed`, `exitCode`) on real implementations.

## Visual harness posture

- Stories MUST render without network calls and without mocking network APIs.
- The seam for swapping data sources between production and harness is the same seam used in tests — a Provider, Layer, or atom-source override.
- A component that requires a backend to render in its harness has a layering bug; fix the component, not the harness.

## Frontend runtime stack

Effect is the unifying runtime model on the frontend.

- Services declared with `Context.Service<Self, Shape>()("ID")`.
- Wiring is explicit: `Layer.effect(Service, makeEffect)` for production, `Layer.succeed(Service, value)` for harnesses and tests.
- Reactive state uses `@effect/atom-react` — atoms over `Atom.runtime(layer)`.
- The harness seam is a `layerAtom` holding the current `Layer<Service>`. Stories and tests override; production leaves it default.
- Avoid hand-rolling query stores, transport hooks, or request caches once Effect is on the critical path. Atoms and layers replace them.
- Effect v4 is the target. New code is written so the path from any Provider/hook scaffolding to v4 atoms is mechanical.

## UI state modeling

React composes views; functional data models state.

- Convert async/runtime primitives into domain-specific ADTs before rendering. Examples: `LibraryListState.fromResult(result)`, `LaunchState.fromExit(id, exit)`.
- ADTs use explicit tags for every meaningful state: `Loading`, `Ready`, `LoadError`, `Defect`, `Launching`, `Failed`, etc.
- Do not expose boolean forests such as `loading`, `error`, `empty`, `failed`, plus nullable payloads as the primary UI contract.
- State-specific components self-select from context or an atom-derived ADT and return `null` when inactive.
- Selection helpers return `Option` (or an equivalent explicit maybe type), not `undefined` payloads.
- Keep conversion and selection helpers pure and covered by unit tests.
- JSX should not be dominated by render props, async-state builder chains, or presenter-level `switch` statements. Those belong behind a domain component boundary when needed.

## API contracts

- Effect Schema is the source of truth for wire payloads, responses, and typed errors.
- Errors are discriminated on `_tag`.
- Generated files are read-only.

## Cross-cutting rules

- Sensitive data is never stored in `localStorage`; non-sensitive local preferences such as feature-gate ids may use it when documented at the storage seam.
- When extracting parts from ISO date strings, use UTC methods. Local-time methods produce locale-dependent results.
- Use the project logger, not `console.log`, in runtime code.

## Verification

Behavioral changes must be verified with a real command or test. Project-specific commands are listed in `AGENTS.md`.

- Run the project's typecheck across the whole repo when path aliases are involved.
- Run unit tests.
- Run E2E or visual tests when the change touches user-facing behavior.
- Run formatter and linter.
