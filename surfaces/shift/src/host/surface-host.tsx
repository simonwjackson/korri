/**
 * Shift's only seam to whatever is hosting it.
 *
 * Everything Shift may ask for arrives through one `SurfaceHost` published at
 * the root. Components read it from context instead of importing a client, an
 * event bus, or a router — which is what keeps Shift portable: swapping the
 * host swaps Korri for a fixture with no component changes.
 *
 * Semantic input is subscribed here rather than in each component so no part of
 * Shift ever touches key codes, gamepad indices, or DOM key events.
 */
import type {
  SurfaceHost,
  SurfaceInputAction,
} from "@contracts/surface/korri-surface"
import { createContext, useContext, useEffect, useRef } from "react"
import type { ReactNode } from "react"

const SurfaceHostContext = createContext<SurfaceHost | null>(null)

export function SurfaceHostProvider({
  host,
  children,
}: {
  readonly host: SurfaceHost
  readonly children: ReactNode
}) {
  return (
    <SurfaceHostContext.Provider value={host}>
      {children}
    </SurfaceHostContext.Provider>
  )
}

export function useSurfaceHost(): SurfaceHost {
  const host = useContext(SurfaceHostContext)
  if (!host) {
    throw new Error("Shift components must be rendered inside a Shift surface")
  }
  return host
}

/**
 * Run `handler` when the host reports a semantic action. The latest handler is
 * always called without resubscribing, so an inline arrow does not churn the
 * host's listener list on every render.
 */
export function useSurfaceAction(
  action: SurfaceInputAction,
  handler: () => void,
): void {
  const host = useContext(SurfaceHostContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    // Absent host: a component rendered standalone (a fixture, a test) still
    // renders; it simply receives no semantic input.
    if (!host) return
    return host.input.on(action, () => handlerRef.current())
  }, [host, action])
}
