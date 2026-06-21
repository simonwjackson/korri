import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { catalogSnapshotAtom } from "@platform/react/catalog/catalog-atoms"
import type { DualScreenChannelFactory } from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import { DualScreenBroadcastSessionRoot } from "@platform/react/display/dual-screen/DualScreenBroadcastSessionRoot"
import { DualScreenSessionRoot } from "@platform/react/display/dual-screen/DualScreenSessionRoot"
import { useLibraryLaunchController } from "@platform/react/library/use-library-launch-controller"
import {
  ShiftCatalogStateRoot,
  useShiftCatalogCase,
} from "@product/surfaces/web/shift/catalog/ShiftCatalogStateRoot"
import { ShiftCompanionScreen } from "@product/surfaces/web/shift/pages/ShiftCompanionScreen"
import { ShiftHomeDefectBody } from "@product/surfaces/web/shift/pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "@product/surfaces/web/shift/pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "@product/surfaces/web/shift/pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "@product/surfaces/web/shift/pages/ShiftHomeLoadingBody"
import { ShiftPrimaryDualScreenSurface } from "@product/surfaces/web/shift/pages/ShiftPrimaryDualScreenSurface"
import { Option } from "effect"
import type { ReactNode } from "react"

export type DualScreenRouteRole = "primary" | "companion"

export interface DualScreenRouteRootProps {
  readonly screenRole: DualScreenRouteRole
  readonly session?: "broadcast" | "memory"
  readonly createChannel?: DualScreenChannelFactory
}

export function parseDualScreenRouteRole(value: unknown): DualScreenRouteRole {
  return value === "companion" ? "companion" : "primary"
}

export function DualScreenRouteRoot({
  screenRole,
  session = "broadcast",
  createChannel,
}: DualScreenRouteRootProps) {
  const snapshot = useAtomValue(catalogSnapshotAtom)
  const refreshSnapshot = useAtomRefresh(catalogSnapshotAtom)
  const launch = useLibraryLaunchController()

  return (
    <ShiftCatalogStateRoot result={snapshot}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={refreshSnapshot} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <DualScreenReadySurface
        role={screenRole}
        session={session}
        createChannel={createChannel}
        launch={launch}
      />
    </ShiftCatalogStateRoot>
  )
}

function DualScreenReadySurface({
  role,
  session,
  createChannel,
  launch,
}: {
  readonly role: DualScreenRouteRole
  readonly session: "broadcast" | "memory"
  readonly createChannel?: DualScreenChannelFactory
  readonly launch: ReturnType<typeof useLibraryLaunchController>
}) {
  const ready = useShiftCatalogCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => {
      const initialGame = games[0]
      if (!initialGame) return null

      return (
        <DualScreenRouteSession
          initialGameId={initialGame.id}
          session={session}
          createChannel={createChannel}
        >
          {role === "primary" ? (
            <ShiftPrimaryDualScreenSurface items={games} launch={launch} />
          ) : (
            <ShiftCompanionScreen items={games} />
          )}
        </DualScreenRouteSession>
      )
    },
  })
}

function DualScreenRouteSession({
  initialGameId,
  session,
  createChannel,
  children,
}: {
  readonly initialGameId: string
  readonly session: "broadcast" | "memory"
  readonly createChannel?: DualScreenChannelFactory
  readonly children: ReactNode
}) {
  if (session === "memory") {
    return (
      <DualScreenSessionRoot initialGameId={initialGameId}>
        {children}
      </DualScreenSessionRoot>
    )
  }

  return (
    <DualScreenBroadcastSessionRoot
      initialGameId={initialGameId}
      createChannel={createChannel}
    >
      {children}
    </DualScreenBroadcastSessionRoot>
  )
}
