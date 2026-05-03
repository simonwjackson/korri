# Effect atoms spike

Throwaway-ready validation of `@effect-atom/atom-react` with an Effect `Library` service, swappable Storybook layers, and `Result.builder` UI state branching.

## What it covers

- In-memory `Library` layer with configurable list and launch outcomes.
- Module-level atoms built from `Atom.runtime((get) => get(libraryLayerAtom))`.
- Pure ADTs that adapt atom `Result`s and launch exits into domain states.
- Self-selecting React state components that consume ADT cases through `Option`.
- `LibraryList` stories for ready, failed launch, loading, and list error states.
- Pure tests for the in-memory layer and state adapters.

## Revert

Revert the spike commit(s) to remove this folder, the Storybook glob, and the `@effect-atom/atom-react` dependency.
