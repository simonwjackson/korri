# Development Philosophy

## Compound Engineering

Each unit of engineering work should make subsequent units easier, not harder.

- Plan enough to avoid rework.
- Keep changes small and reviewable.
- Codify reusable patterns in code, tests, and existing docs when requested.
- Keep quality high so future changes stay easy.

## Design-First

Start from the user experience and work backward to implementation.

- What does the user see?
- What do they do?
- What happens when something goes wrong?

## Systems Thinking

Build for composability.

- Vertical slices over horizontal layers.
- Clean boundaries between product code and shared code.
- Effect-first for API contracts, typed errors, and business logic.
- Pure domain logic, infrastructure at the edges.

## Completion Reflex

Do not ship something merely because it compiles.

- Understand assumptions about inputs, environment, and callers.
- Prefer the minimum code that solves the stated problem.
- Verify behavior with real commands.
