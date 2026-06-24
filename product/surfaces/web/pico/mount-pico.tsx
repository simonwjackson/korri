/**
 * Mount the real Pico surface: an atom-seeded, router-driven click-through host
 * (home -> /game/$id) rendered against the live catalog/library atoms. Mirrors
 * mount-shift; the host supplies the data (initial atom values), navigation
 * (history), and an optional chrome slot. Pico's screens are scoped under
 * [data-pico].pico-screen.intrinsic so its tokens + recipe resolve.
 */
import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react"
import type { RouterHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import type { CSSProperties, ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { createPicoRouter } from "./routes/pico-route-tree"
import "./pico-prototype.css"

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0]
type PicoRouter = ReturnType<typeof createPicoRouter>

export interface MountPicoOptions {
  readonly data: { readonly initialValues: AtomInitialValues }
  readonly navigation?: { readonly history?: RouterHistory }
  readonly beforeRouter?: ReactNode
}

export interface MountedPicoSurface {
  readonly router: PicoRouter
  readonly dispose: () => void
}

const PICO_FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
}

export function PicoSurfaceApp({
  initialValues,
  router,
  beforeRouter,
}: {
  readonly initialValues: AtomInitialValues
  readonly router: PicoRouter
  readonly beforeRouter?: ReactNode
}) {
  useAtomInitialValues(initialValues)
  return (
    <>
      {beforeRouter}
      <div data-pico className="pico-screen intrinsic" style={PICO_FRAME_STYLE}>
        <RouterProvider router={router} />
      </div>
    </>
  )
}

export function mountPico(
  host: HTMLElement,
  options: MountPicoOptions,
): MountedPicoSurface {
  const router = createPicoRouter({ history: options.navigation?.history })
  const root = createRoot(host)

  root.render(
    <RegistryProvider>
      <PicoSurfaceApp
        initialValues={options.data.initialValues}
        router={router}
        beforeRouter={options.beforeRouter}
      />
    </RegistryProvider>,
  )

  return {
    router,
    dispose: () => root.unmount(),
  }
}
