import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { DualScreenChannelFactory } from "@shared/display/dual-screen/DualScreenBroadcastSessionRoot"
import { DualScreenBroadcastSessionRoot } from "@shared/display/dual-screen/DualScreenBroadcastSessionRoot"
import { DualScreenSessionRoot } from "@shared/display/dual-screen/DualScreenSessionRoot"
import { libraryItemsAtom } from "@shared/library/library-atoms"
import {
  LibraryListStateRoot,
  useLibraryListCase,
} from "@shared/library/library-list-state-root"
import { useLibraryLaunchController } from "@shared/library/use-library-launch-controller"
import { ShiftCompanionScreen } from "@shared/themes/shift/pages/ShiftCompanionScreen"
import { ShiftHomeDefectBody } from "@shared/themes/shift/pages/ShiftHomeDefectBody"
import { ShiftHomeEmptyBody } from "@shared/themes/shift/pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "@shared/themes/shift/pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "@shared/themes/shift/pages/ShiftHomeLoadingBody"
import { ShiftPrimaryDualScreenSurface } from "@shared/themes/shift/pages/ShiftPrimaryDualScreenSurface"
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
  const items = useAtomValue(libraryItemsAtom)
  const refreshItems = useAtomRefresh(libraryItemsAtom)
  const launch = useLibraryLaunchController()

  return (
    <LibraryListStateRoot result={items}>
      <ShiftHomeLoadingBody />
      <ShiftHomeLoadErrorBody onRetry={refreshItems} />
      <ShiftHomeDefectBody />
      <ShiftHomeEmptyBody />
      <DualScreenReadySurface
        role={screenRole}
        session={session}
        createChannel={createChannel}
        launch={launch}
      />
    </LibraryListStateRoot>
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
  const ready = useLibraryListCase("Ready")

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
