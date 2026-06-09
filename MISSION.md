# Mission: Effect + React atoms for Korri UI state

## Why
Learn Effect services, layers, and React atoms well enough to build Korri UI state without boolean prop forests, hand-rolled query stores, or transport-specific hooks leaking into components.

## Success looks like
- Read an existing Korri atom stack and identify the service, layer, runtime atom, data atom, and React hook boundary.
- Add or modify a small Effect-backed UI state surface using a swappable Layer seam for production, tests, and Storybook.
- Convert raw atom results or command exits into domain ADTs before rendering React state components.
- Explain when to use `Layer.succeed`, `Layer.effect`, `Atom.runtime(get => ...)`, `useAtomValue`, and `useAtomSet`.

## Constraints
- Lessons should stay grounded in Korri code and current project conventions.
- Each lesson should teach one small thing and include a tight feedback loop.
- Prefer official Effect / atom-react docs and local Korri docs over memory.

## Out of scope
- Full Effect internals, advanced fiber theory, or generic FP theory until needed for Korri work.
- Building a generic result-boundary framework before multiple Korri features force it.
