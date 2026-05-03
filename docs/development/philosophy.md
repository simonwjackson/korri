# Development Philosophy

Project-agnostic principles. They describe how engineering work compounds across any project. Project-specific rules and runtime quirks live in the project's `AGENTS.md`.

## Compound Engineering

Each unit of engineering work should make subsequent units easier, not harder.

- Plan enough to avoid rework.
- Keep changes small and reviewable.
- Codify reusable patterns in code, tests, and these docs when requested.
- Keep quality high so future changes stay easy.

## Engineering docs are the source of truth

`docs/development/{philosophy,standards,style-guide}.md` is canonical for humans and agents alike.

- Substantive rules live here.
- Agent-facing files (`AGENTS.md`, `CLAUDE.md`) carry only harness-specific content and project-specific quirks; they defer to these docs.
- When a rule applies across projects, it lives in this folder.

## Design-First

Start from the user experience and work backward to implementation.

- What does the user see?
- What do they do?
- What happens when something goes wrong?

## Completion Reflex

Do not ship something merely because it compiles.

- Understand assumptions about inputs, environment, and callers.
- Prefer the minimum code that solves the stated problem.
- Verify behavior with real commands.

## Systems Thinking

Build for composability.

- Vertical slices over horizontal layers.
- Clean boundaries between product code and shared code.
- Pure domain logic, infrastructure at the edges.

## React at the boundary, functional core underneath

UI should read like React composition; state should behave like functional data.

- Model feature state as small discriminated unions, not bags of booleans and nullable fields.
- Convert infrastructure primitives (`Result`, `Exit`, RPC responses, process outcomes) into domain ADTs at the seam.
- Components compose visual states; pure adapters select and transform state.
- Prefer self-selecting state components over render props, fluent builders in JSX, or imperative presenter switches.
- Keep state conversion functions pure and directly testable.

## Reusable code is product-agnostic, today

Shared code does not reach into product code. Reusability is a property right now or never.

- Shared modules cannot import from product-specific layers (routes, RPC clients, app wiring).
- A shared module that only works inside one app is a product module wearing a costume.
- Move it, narrow its imports, or delete the boundary.

## Real implementations over mocks

Test what you ship by exercising the actual contract, not a stand-in.

- No `Mock*` / `Stub*` / `Fake*` classes in production or test code.
- Test doubles are real implementations with configurable behavior — outcome, delay, error, seed data.
- Configurability replaces faux-ness as the marker of a test seam.

## Visual harnesses are first-class consumers

Any page or component renders in its visual harness with only fixture data and configured behavior.

- No network calls in stories.
- No `vi.mock`, no MSW, no `globalThis.fetch` swap.
- A component that requires a backend to appear in Storybook has a layering bug — fix the component, not the harness.

## Effect is the unifying runtime model

Effect spans the stack — services, layers, atoms, schemas.

- Same primitives backend and frontend.
- Service contracts compose across the wire.
- New seams are designed with Effect v4 atoms + layers as the destination, even when the immediate implementation is simpler.
