# Effect + React Atoms Resources

## Knowledge

- [Effect Documentation: Managing Services](https://effect.website/docs/requirements-management/services/)
  Official Effect docs on declaring service dependencies through the Effect requirements type and accessing services from programs. Use for: understanding what a service is and why Effect avoids manually passing dependency bags.
- [Effect Documentation: Managing Layers](https://effect.website/docs/requirements-management/layers/)
  Official Effect docs on using Layers as constructors for services and keeping service interfaces from leaking implementation dependencies. Use for: deciding what belongs in a service shape versus layer construction.
- [Effect Atom: Introduction](https://tim-smart-effect-atom.mintlify.app/introduction)
  Effect Atom docs describing reactive atoms, Effect integration, async Result state, streams, and React hooks. Use for: the mental model of atoms as reactive descriptors over Effect programs.
- [Effect Atom: Services and layers](https://tim-smart-effect-atom.mintlify.app/guides/services-and-layers)
  Effect Atom guide for `Atom.runtime`, runtime atoms, service-backed atoms, function atoms, and Layer composition. Use for: wiring Effect services into React atom state.
- [`@effect/atom-react` package README](node_modules/@effect/atom-react/README.md)
  Local installed package pointer to the API reference for the exact dependency Korri uses. Use for: verifying package identity and current API entrypoints.
- [Korri solution: React state components over async-state render props for Effect atoms](docs/solutions/best-practices/react-state-components-over-result-render-props-for-effect-atoms-2026-05-03.md)
  Project-specific best practice for converting raw atom async state into domain ADTs and self-selecting React state components. Use for: Korri UI composition patterns.
- [Korri research: Setting atoms from outside React in `@effect/atom-react`](docs/research/effect-atom-react/deepen-u4-atom-react.md)
  Project research on `AtomRegistry`, `RegistryProvider initialValues`, atom registry identity, and atoms-of-layers as Korri's test/story seam. Use for: boot-time layer seeding and registry gotchas.
- [Korri code: library atoms](product/platform/react/library/library-atoms.ts)
  Current project example of `Atom.make` layer seams, `Atom.runtime(get => Layer.merge(...))`, data atoms, refresh atoms, and function atoms. Use for: concrete examples during lessons.

## Wisdom (Communities)

- [Effect Discord](https://discord.gg/effect-ts)
  Official Effect community. Use for: checking idioms and edge cases when the docs and Korri examples disagree.
- [Effect GitHub discussions / issues](https://github.com/Effect-TS/effect/issues)
  Maintainer-visible place for package behavior and bug reports. Use for: version-specific API questions around Effect 4 beta and atom-react.

## Gaps

- Need a compact Korri-specific glossary for Effect + React atoms terminology.
- Need small exercises that can be run against Korri code without requiring a full app server.
