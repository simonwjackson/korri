import { useEffect, useRef, useState } from "react"
import { usePlatformBridge } from "./platform-bridge-context"
import { type FirstPartySurfaceId, loadSurfaceEntrypoint } from "./surface-host-registry"

export function SurfaceHost({
  surfaceId,
  loadEntrypoint = loadSurfaceEntrypoint,
}: {
  readonly surfaceId: FirstPartySurfaceId
  readonly loadEntrypoint?: typeof loadSurfaceEntrypoint
}) {
  const bridge = usePlatformBridge()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setError(null)

    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let dispose: (() => void) | undefined
    host.replaceChildren()

    void loadEntrypoint(surfaceId)
      .then(entrypoint => {
        if (cancelled) return
        const mounted = entrypoint.mount(host, { bridge })
        dispose = typeof mounted === "function" ? mounted : undefined
      })
      .catch(cause => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        }
      })

    return () => {
      cancelled = true
      dispose?.()
      host.replaceChildren()
    }
  }, [bridge, loadEntrypoint, surfaceId])

  return (
    <>
      {error ? (
        <div role="alert" className="p-6 text-sm text-red-600">
          Failed to load surface {surfaceId}: {error.message}
        </div>
      ) : null}
      <div
        data-korri-surface-host={surfaceId}
        hidden={Boolean(error)}
        ref={hostRef}
      />
    </>
  )
}
