import { createMemoryHistory } from "@tanstack/history"
import type * as Atom from "effect/unstable/reactivity/Atom"
import { useEffect, useRef, useState } from "react"
import { normalizeSurfacePath } from "./lab-route-state"
import { registerLabSurfaceRegistry } from "./model/lab-surface-registries"
import type {
  LabMountedSurface,
  LabSurfaceAdapter,
  LabSurfaceDualScreenOptions,
} from "./surface-registry"

export function LabSurfaceMount({
  adapter,
  initialValues,
  surfacePath,
  onNavigate,
  onLocationChange,
  dualScreen,
  scopeId,
}: {
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
  readonly surfacePath: string
  readonly onNavigate: (surfacePath: string) => void
  /** Reports this frame's live location (path + search) so chrome can show a
   * per-frame route identity. Fires on mount and on every navigation. */
  readonly onLocationChange?: (location: {
    readonly path: string
    readonly search: string
  }) => void
  readonly dualScreen?: LabSurfaceDualScreenOptions
  readonly scopeId?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef<LabMountedSurface | null>(null)
  const unregisterRegistryRef = useRef<() => void>(() => {})
  const historyRef = useRef<ReturnType<typeof createMemoryHistory> | null>(null)
  const [mountError, setMountError] = useState<Error | null>(null)
  const suppressPathRef = useRef<string | null>(null)
  const canonicalPathRef = useRef(normalizeSurfacePath(surfacePath))
  const initialValuesRef = useRef(initialValues)
  const onNavigateRef = useRef(onNavigate)
  const onLocationChangeRef = useRef(onLocationChange)
  const dualScreenRef = useRef(dualScreen)

  initialValuesRef.current = initialValues
  onNavigateRef.current = onNavigate
  onLocationChangeRef.current = onLocationChange
  dualScreenRef.current = dualScreen
  canonicalPathRef.current = normalizeSurfacePath(surfacePath)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    setMountError(null)
    host.replaceChildren()
    const initialPath = canonicalPathRef.current
    const history = createMemoryHistory({ initialEntries: [initialPath] })
    historyRef.current = history
    onLocationChangeRef.current?.({
      path: history.location.pathname,
      search: history.location.search,
    })

    const unsubscribe = history.subscribe(({ location }) => {
      // Report the full location (including search) for the per-frame identity
      // before the path-only mirror logic decides whether to bubble.
      onLocationChangeRef.current?.({
        path: location.pathname,
        search: location.search,
      })
      const nextPath = normalizeSurfacePath(location.pathname)
      if (suppressPathRef.current === nextPath) {
        suppressPathRef.current = null
        return
      }
      if (nextPath === canonicalPathRef.current) return
      onNavigateRef.current(nextPath)
    })

    let mounted: LabMountedSurface | null = null
    try {
      mounted = adapter.mountSurface(host, {
        initialValues: initialValuesRef.current,
        history,
        dualScreen: dualScreenRef.current,
        onRegistry: registry => {
          unregisterRegistryRef.current()
          unregisterRegistryRef.current = registerLabSurfaceRegistry({
            scopeId,
            registry,
            seed: seedMapFromInitialValues(initialValuesRef.current),
          })
        },
      })
      mountedRef.current = mounted
    } catch (cause) {
      setMountError(cause instanceof Error ? cause : new Error(String(cause)))
    }

    return () => {
      unsubscribe()
      unregisterRegistryRef.current()
      unregisterRegistryRef.current = () => {}
      mounted?.dispose()
      history.destroy()
      mountedRef.current = null
      historyRef.current = null
      host.replaceChildren()
    }
  }, [adapter, scopeId])

  useEffect(() => {
    const history = historyRef.current
    if (!history) return

    const nextPath = normalizeSurfacePath(surfacePath)
    if (normalizeSurfacePath(history.location.pathname) === nextPath) return

    suppressPathRef.current = nextPath
    history.push(nextPath)
  }, [surfacePath])

  if (mountError) {
    return (
      <div role="alert" data-lab-surface-mount={adapter.id}>
        Failed to mount {adapter.id}: {mountError.message}
      </div>
    )
  }

  return <div data-lab-surface-mount={adapter.id} ref={hostRef} />
}

function seedMapFromInitialValues(
  initialValues: unknown,
): ReadonlyMap<Atom.Atom<unknown>, unknown> {
  if (!Array.isArray(initialValues)) return new Map()
  return new Map(
    initialValues as readonly (readonly [Atom.Atom<unknown>, unknown])[],
  )
}
