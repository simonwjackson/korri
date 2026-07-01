/**
 * Lab-side hub of the live atom registries for the surfaces currently mounted on
 * the device canvas. It exists so a lab control (a state axis) can drive the
 * REAL edge — the surface's own source atoms — instead of a production-inert
 * preview side channel: pinning a state sets the real source layer in every
 * mounted registry, exactly the value production injects from the live source.
 *
 * This is tool-side only and holds references to the real registries; production
 * has no knowledge of it. The seed map is the surface's mount-time initial
 * values, so "release" can restore the seeded live source the same way it was
 * first injected.
 */
import type * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

export interface LabSurfaceRegistryEntry {
  /** Canvas object that owns this mounted surface, when mounted from the lab
   * workspace. Unscoped entries are intentionally affected by global controls. */
  readonly scopeId?: string
  readonly registry: AtomRegistry.AtomRegistry
  /** The surface's mount-time atom seed, so an axis can restore the live source. */
  readonly seed: ReadonlyMap<Atom.Atom<unknown>, unknown>
}

const entries = new Set<LabSurfaceRegistryEntry>()

/** Register a mounted surface's registry; returns an unregister for unmount. */
export function registerLabSurfaceRegistry(
  entry: LabSurfaceRegistryEntry,
): () => void {
  entries.add(entry)
  return () => {
    entries.delete(entry)
  }
}

/** Run a side effect against every mounted surface's registry. */
export function eachLabSurfaceRegistry(
  run: (entry: LabSurfaceRegistryEntry) => void,
): void {
  for (const entry of entries) run(entry)
}

/** Run a side effect against one canvas object's mounted surface registries. */
export function eachLabSurfaceRegistryForScope(
  scopeId: string,
  run: (entry: LabSurfaceRegistryEntry) => void,
): void {
  for (const entry of entries) {
    if (entry.scopeId === scopeId) run(entry)
  }
}

/** Run against one scope's registries when scoped, or every mounted registry
 * when unscoped — the shared dispatch shape for inputs, events, and axes. */
export function eachLabTargetRegistry(
  scopeId: string | undefined,
  run: (entry: LabSurfaceRegistryEntry) => void,
): void {
  if (scopeId !== undefined) {
    eachLabSurfaceRegistryForScope(scopeId, run)
    return
  }
  eachLabSurfaceRegistry(run)
}

/** Drop every entry. Test-only cleanup; real entries unregister on unmount. */
export function clearLabSurfaceRegistries(): void {
  entries.clear()
}
