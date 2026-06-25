import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react"
import type { RouterHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import type { CSSProperties, ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { createBoxbusterRouter } from "./routes/boxbuster-route-tree"

import "./boxbuster.css"

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0]
type BoxbusterRouter = ReturnType<typeof createBoxbusterRouter>

export interface MountBoxbusterOptions {
  readonly data: { readonly initialValues: AtomInitialValues }
  readonly navigation?: { readonly history?: RouterHistory }
  readonly beforeRouter?: ReactNode
}

export interface MountedBoxbusterSurface {
  readonly router: BoxbusterRouter
  readonly dispose: () => void
}

const BOXBUSTER_FRAME_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
}

export function BoxbusterSurfaceApp({
  initialValues,
  router,
  beforeRouter,
}: {
  readonly initialValues: AtomInitialValues
  readonly router: BoxbusterRouter
  readonly beforeRouter?: ReactNode
}) {
  useAtomInitialValues(initialValues)
  return (
    <>
      {beforeRouter}
      <div style={BOXBUSTER_FRAME_STYLE}>
        <RouterProvider router={router} />
      </div>
    </>
  )
}

export function mountBoxbuster(
  host: HTMLElement,
  options: MountBoxbusterOptions,
): MountedBoxbusterSurface {
  const router = createBoxbusterRouter({ history: options.navigation?.history })
  const root = createRoot(host)

  root.render(
    <RegistryProvider>
      <BoxbusterSurfaceApp
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
