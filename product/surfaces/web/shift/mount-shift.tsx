import {
  RegistryContext,
  RegistryProvider,
  useAtomInitialValues,
} from "@effect/atom-react"
import {
  DualScreenBroadcastSessionRoot,
  type DualScreenChannelFactory,
} from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import type { DualScreenRole } from "@platform/react/display/dual-screen/dual-screen-events"
import type { RouterHistory } from "@tanstack/history"
import { RouterProvider } from "@tanstack/react-router"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { type ReactNode, useContext, useEffect } from "react"
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

export interface ShiftDualScreenAdapter {
  readonly role: DualScreenRole
  readonly channelName: string
  readonly initialGameId?: string | null
  readonly createChannel?: DualScreenChannelFactory
}

export interface MountShiftOptions {
  readonly data: ShiftDataAdapter
  readonly navigation?: ShiftNavigationAdapter
  readonly input?: ShiftInputAdapter
  readonly dualScreen?: ShiftDualScreenAdapter
  readonly beforeRouter?: ReactNode
  /** Design-tool seam: receive the mounted surface's atom registry so a lab can
   * drive the real source atoms live. Inert in production (nothing passes it). */
  readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
}

export interface MountedShiftSurface {
  readonly router: ShiftRouter
  readonly dispose: () => void
}

function ShiftRegistryBridge({
  onRegistry,
}: {
  readonly onRegistry: (registry: AtomRegistry.AtomRegistry) => void
}) {
  const registry = useContext(RegistryContext)
  useEffect(() => {
    onRegistry(registry)
  }, [registry, onRegistry])
  return null
}

export function ShiftSurfaceApp({
  initialValues,
  router,
  beforeRouter,
  dualScreen,
  onRegistry,
}: {
  readonly initialValues: AtomInitialValues
  readonly router: ShiftRouter
  readonly beforeRouter?: ReactNode
  readonly dualScreen?: ShiftDualScreenAdapter
  readonly onRegistry?: (registry: AtomRegistry.AtomRegistry) => void
}) {
  useAtomInitialValues(initialValues)
  const routed = (
    <>
      {onRegistry ? <ShiftRegistryBridge onRegistry={onRegistry} /> : null}
      {beforeRouter}
      <RouterProvider router={router} />
    </>
  )
  return dualScreen ? (
    <DualScreenBroadcastSessionRoot
      role={dualScreen.role}
      channelName={dualScreen.channelName}
      initialGameId={dualScreen.initialGameId ?? null}
      createChannel={dualScreen.createChannel}
    >
      {routed}
    </DualScreenBroadcastSessionRoot>
  ) : (
    routed
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
        dualScreen={options.dualScreen}
        onRegistry={options.onRegistry}
      />
    </RegistryProvider>,
  )

  return {
    router,
    dispose: () => root.unmount(),
  }
}
