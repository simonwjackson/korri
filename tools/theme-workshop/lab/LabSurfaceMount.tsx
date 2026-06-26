import { createMemoryHistory } from "@tanstack/history"
import { useEffect, useRef, useState } from "react"
import { normalizeSurfacePath } from "./lab-route-state"
import type { LabSurfaceAdapter, LabMountedSurface } from "./surface-registry"

export function LabSurfaceMount({
  adapter,
  initialValues,
  surfacePath,
  onNavigate,
}: {
  readonly adapter: LabSurfaceAdapter
  readonly initialValues: unknown
  readonly surfacePath: string
  readonly onNavigate: (surfacePath: string) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef<LabMountedSurface | null>(null)
  const historyRef = useRef<ReturnType<typeof createMemoryHistory> | null>(null)
  const [mountError, setMountError] = useState<Error | null>(null)
  const suppressPathRef = useRef<string | null>(null)
  const canonicalPathRef = useRef(normalizeSurfacePath(surfacePath))
  const initialValuesRef = useRef(initialValues)
  const onNavigateRef = useRef(onNavigate)

  initialValuesRef.current = initialValues
  onNavigateRef.current = onNavigate
  canonicalPathRef.current = normalizeSurfacePath(surfacePath)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    setMountError(null)
    host.replaceChildren()
    const initialPath = canonicalPathRef.current
    const history = createMemoryHistory({ initialEntries: [initialPath] })
    historyRef.current = history

    const unsubscribe = history.subscribe(({ location }) => {
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
      })
      mountedRef.current = mounted
    } catch (cause) {
      setMountError(cause instanceof Error ? cause : new Error(String(cause)))
    }

    return () => {
      unsubscribe()
      mounted?.dispose()
      history.destroy()
      mountedRef.current = null
      historyRef.current = null
      host.replaceChildren()
    }
  }, [adapter])

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
