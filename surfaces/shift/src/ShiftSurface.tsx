/**
 * Shift's composition root — the only component a host renders.
 *
 * It takes one `SurfaceModel` (what Korri knows) plus one `SurfaceHost` (what
 * Shift may ask for) and owns everything else: which catalog body shows, which
 * game the command sheet is about, and how the model's shape becomes the
 * cinematic scene's props. Nothing below this file knows a host exists beyond
 * the semantic-input hook.
 */
import type {
  SurfaceAction,
  SurfaceGame,
  SurfaceHost,
  SurfaceModel,
} from "@contracts/surface/korri-surface"
import { useCallback, useMemo, useState } from "react"
import { SurfaceHostProvider } from "./host/surface-host"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./pages/ShiftCinematicHome"
import { ShiftHomeEmptyBody } from "./pages/ShiftHomeEmptyBody"
import { ShiftHomeLoadErrorBody } from "./pages/ShiftHomeLoadErrorBody"
import { ShiftHomeLoadingBody } from "./pages/ShiftHomeLoadingBody"
import { ShiftSettings } from "./pages/ShiftSettings"
import { ShiftGameActionsSheet } from "./ui/organisms/ShiftGameActionsSheet"

export interface ShiftSurfaceProps {
  readonly model: SurfaceModel
  readonly host: SurfaceHost
}

/**
 * Map one catalog entry onto the scene's game shape. Absent art becomes an
 * empty string, which is how Shift's cover-art atom self-selects the title
 * monogram — the gap is presented, never filled in with a placeholder asset.
 */
export function shiftGameFromSurfaceGame(
  game: SurfaceGame,
): ShiftCinematicGame {
  return {
    id: game.id,
    title: game.title,
    tileArtUrl: game.coverArtUrl ?? "",
    wideArtUrl: game.wideArtUrl ?? "",
    ...(game.section === undefined ? {} : { section: game.section }),
    ...(game.subtitle === undefined ? {} : { subtitle: game.subtitle }),
    ...(game.resumable === undefined ? {} : { resumable: game.resumable }),
  }
}

/**
 * The rail's Settings destination. Shift owns it, not Korri: which screens a
 * surface has, and how you reach them, is the surface's business — Korri only
 * says what the settings themselves are. It joins the host's own rail actions
 * as an ordinary affordance, so the rail learns nothing new.
 */
export const SHIFT_SETTINGS_ACTION_ID = "shift:settings"

const SETTINGS_AFFORDANCE: SurfaceAction = {
  id: SHIFT_SETTINGS_ACTION_ID,
  label: "Settings",
  description: "What this device is, and what it can currently reach.",
  enabled: true,
}

export function ShiftSurface({ model, host }: ShiftSurfaceProps) {
  const [sheetGameId, setSheetGameId] = useState<string | null>(null)
  const [screen, setScreen] = useState<"home" | "settings">("home")

  const games = useMemo(
    () =>
      model.catalog._tag === "Ready"
        ? model.catalog.games.map(shiftGameFromSurfaceGame)
        : [],
    [model.catalog],
  )

  const closeSheet = useCallback(() => setSheetGameId(null), [])

  // Settings appears in the rail only when Korri has something to state; an
  // empty screen is not worth a destination.
  const railActions = useMemo<readonly SurfaceAction[]>(
    () =>
      model.settings.length > 0
        ? [...model.actions, SETTINGS_AFFORDANCE]
        : model.actions,
    [model.actions, model.settings],
  )

  // Shift's own destination is consumed here; everything else is Korri's.
  const runRailAction = useCallback(
    (actionId: string) => {
      if (actionId === SHIFT_SETTINGS_ACTION_ID) {
        setScreen("settings")
        return
      }
      host.runAction(actionId)
    },
    [host],
  )

  const sheetGame = games.find(game => game.id === sheetGameId)
  // Ask the host only while the sheet is actually about a game, so a host that
  // computes actions lazily is not polled on every render.
  const sheetActions = sheetGameId ? host.gameActions(sheetGameId) : []
  // A game with no host-declared actions has no command sheet to show; the
  // Options affordance disappears with it rather than opening an empty panel.
  const hasGameActions =
    model.catalog._tag === "Ready" &&
    model.catalog.games.some(game => host.gameActions(game.id).length > 0)

  const body =
    screen === "settings" ? (
      <ShiftSettings
        groups={model.settings}
        {...(model.clockLabel === undefined ? {} : { time: model.clockLabel })}
        onClose={() => setScreen("home")}
      />
    ) : model.catalog._tag === "Loading" ? (
      <ShiftHomeLoadingBody />
    ) : model.catalog._tag === "Error" ? (
      <ShiftHomeLoadErrorBody
        message={model.catalog.message}
        onRetry={() => host.reload()}
      />
    ) : model.catalog._tag === "Empty" ? (
      <ShiftHomeEmptyBody />
    ) : (
      <ShiftCinematicHome
        games={games}
        {...(model.clockLabel === undefined ? {} : { time: model.clockLabel })}
        status={model.status}
        actions={railActions}
        onLaunch={gameId => host.launchGame(gameId)}
        onAction={runRailAction}
        onRetry={() => host.retry()}
        onDismiss={() => host.dismiss()}
        {...(hasGameActions ? { onOptions: setSheetGameId } : {})}
      />
    )

  return (
    <SurfaceHostProvider host={host}>
      {/* The surface root is Shift's token scope, its size container, and the
          positioned/clipping box the sheet anchors to. */}
      <div
        data-shift-surface
        data-shift-home-frame
        className="shift-sheet-host intrinsic"
      >
        {body}
        {sheetGame ? (
          <ShiftGameActionsSheet
            open
            gameTitle={sheetGame.title}
            actions={sheetActions}
            onSelect={actionId => {
              closeSheet()
              host.runGameAction(sheetGame.id, actionId)
            }}
            onClose={closeSheet}
          />
        ) : null}
      </div>
    </SurfaceHostProvider>
  )
}
