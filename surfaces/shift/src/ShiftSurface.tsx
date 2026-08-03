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

export function ShiftSurface({ model, host }: ShiftSurfaceProps) {
  const [sheetGameId, setSheetGameId] = useState<string | null>(null)

  const games = useMemo(
    () =>
      model.catalog._tag === "Ready"
        ? model.catalog.games.map(shiftGameFromSurfaceGame)
        : [],
    [model.catalog],
  )

  const closeSheet = useCallback(() => setSheetGameId(null), [])
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
    model.catalog._tag === "Loading" ? (
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
        actions={model.actions}
        onLaunch={gameId => host.launchGame(gameId)}
        onAction={actionId => host.runAction(actionId)}
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
