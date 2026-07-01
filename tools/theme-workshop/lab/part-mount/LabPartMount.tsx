import type * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { type ComponentType, useCallback, useEffect, useRef } from "react"
import { registerLabSurfaceRegistry } from "../model/lab-surface-registries"
import type {
  LabPartRegistryRootProps,
  LabSurfacePartMountSpec,
} from "../surface-registry"

/**
 * Mount host for one placed part: renders the part's real subtree inside the
 * surface's own part registry root and registers the resulting registry in
 * the lab hub under the owning canvas object's scope — the same lifecycle
 * `LabSurfaceMount` gives a live device (mount, register with seed, restore on
 * unmount). Part edges (axes/inputs/events) then drive the part exactly like a
 * device: by writing the real atoms in its registered registry.
 *
 * Binding edits do NOT remount: when `bindingKey` changes, the new spec's
 * binding→atoms projection is written into the SAME live registry, so the
 * part reacts through its real subscription path. The mount-time seed is kept
 * for `release` (restoring the seeded live source), matching device mounts.
 */
export function LabPartMount({
  Root,
  spec,
  bindingKey,
  scopeId,
}: {
  readonly Root: ComponentType<LabPartRegistryRootProps>
  readonly spec: LabSurfacePartMountSpec
  readonly bindingKey: string
  readonly scopeId?: string
}) {
  const seedRef = useRef(spec.initialValues)
  const specRef = useRef(spec)
  specRef.current = spec
  const registryRef = useRef<AtomRegistry.AtomRegistry | null>(null)
  const unregisterRef = useRef<() => void>(() => {})
  const lastKeyRef = useRef(bindingKey)

  const handleRegistry = useCallback(
    (registry: AtomRegistry.AtomRegistry) => {
      registryRef.current = registry
      unregisterRef.current()
      unregisterRef.current = registerLabSurfaceRegistry({
        scopeId,
        registry,
        seed: new Map(seedRef.current),
      })
    },
    [scopeId],
  )

  useEffect(
    () => () => {
      unregisterRef.current()
      unregisterRef.current = () => {}
      registryRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (lastKeyRef.current === bindingKey) return
    lastKeyRef.current = bindingKey
    const registry = registryRef.current
    if (!registry) return
    for (const [atom, value] of specRef.current.initialValues) {
      // Seed pairs are erased to Atom<unknown>; every seedable atom is a
      // writable source atom (same erasure LabSurfaceMount's seed map uses).
      registry.set(atom as Atom.Writable<unknown, unknown>, value)
    }
  }, [bindingKey])

  return (
    <Root initialValues={seedRef.current} onRegistry={handleRegistry}>
      {spec.node}
    </Root>
  )
}
