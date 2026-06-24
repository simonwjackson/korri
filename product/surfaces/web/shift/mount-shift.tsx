import { RegistryProvider, useAtomInitialValues } from "@effect/atom-react"
import type { RouterHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { createShiftRouter } from "./routes/route-tree"

type AtomInitialValues = Parameters<typeof useAtomInitialValues>[0]
type ShiftRouter = ReturnType<typeof createShiftRouter>

export interface ShiftDataAdapter {
  readonly initialValues: AtomInitialValues
}

export interface ShiftNavigationAdapter {
  readonly history?: RouterHistory
  readonly router?: ShiftRouter
}

export interface ShiftInputAdapter {
  readonly enabled?: boolean
}

export interface MountShiftOptions {
  readonly data: ShiftDataAdapter
  readonly navigation?: ShiftNavigationAdapter
  readonly input?: ShiftInputAdapter
  readonly beforeRouter?: ReactNode
}

export interface MountedShiftSurface {
  readonly router: ShiftRouter
  readonly dispose: () => void
}

export function ShiftSurfaceApp({
  initialValues,
  router,
  beforeRouter,
}: {
  readonly initialValues: AtomInitialValues
  readonly router: ShiftRouter
  readonly beforeRouter?: ReactNode
}) {
  useAtomInitialValues(initialValues)
  return (
    <>
      {beforeRouter}
      <RouterProvider router={router} />
    </>
  )
}

export function mountShift(
  host: HTMLElement,
  options: MountShiftOptions,
): MountedShiftSurface {
  const router =
    options.navigation?.router ??
    createShiftRouter({ history: options.navigation?.history })
  const root = createRoot(host)

  root.render(
    <RegistryProvider>
      <ShiftSurfaceApp
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
