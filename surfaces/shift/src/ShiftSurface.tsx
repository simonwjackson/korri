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
import { ShiftLibraryGrid } from "./pages/ShiftLibraryGrid"
import type { ShiftLibraryGame } from "./pages/shift-library-game"
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

export function shiftLibraryGameFromSurfaceGame(
  game: SurfaceGame,
): ShiftLibraryGame {
  return {
    id: game.id,
    title: game.title,
    artUrl: game.coverArtUrl ?? "",
  }
}

/**
 * The rail's Settings destination. Shift owns it, not Korri: which screens a
 * surface has, and how you reach them, is the surface's business — Korri only
 * says what the settings themselves are. It joins the host's own rail actions
 * as an ordinary affordance, so the rail learns nothing new.
 */
export const SHIFT_LIBRARY_ACTION_ID = "shift:library"
export const SHIFT_SETTINGS_ACTION_ID = "shift:settings"

const LIBRARY_AFFORDANCE: SurfaceAction = {
  id: SHIFT_LIBRARY_ACTION_ID,
  label: "Library",
  description: "Browse every game Korri knows about.",
  enabled: true,
}

const SETTINGS_AFFORDANCE: SurfaceAction = {
  id: SHIFT_SETTINGS_ACTION_ID,
  label: "Settings",
  description: "What this device is, and what it can currently reach.",
  enabled: true,
}

export function ShiftSurface({ model, host }: ShiftSurfaceProps) {
  const [sheetGameId, setSheetGameId] = useState<string | null>(null)
  const [screen, setScreen] = useState<"home" | "library" | "settings">("home")

  const surfaceGames = model.catalog._tag === "Ready" ? model.catalog.games : []
  const games = useMemo(
    () => surfaceGames.map(shiftGameFromSurfaceGame),
    [surfaceGames],
  )
  const libraryGames = useMemo(
    () => surfaceGames.map(shiftLibraryGameFromSurfaceGame),
    [surfaceGames],
  )

  const closeSheet = useCallback(() => setSheetGameId(null), [])

  // Setup commands live with their current values in Settings. The original
  // Library destination returns as Shift's browse-everything route, backed only
  // by Korri's catalog rather than Sunshine app advertisements.
  const railActions = useMemo<readonly SurfaceAction[]>(
    () => [
      ...(model.catalog._tag === "Ready" ? [LIBRARY_AFFORDANCE] : []),
      ...(model.settings.length > 0 ? [SETTINGS_AFFORDANCE] : []),
    ],
    [model.catalog._tag, model.settings],
  )

  const runRailAction = useCallback((actionId: string) => {
    if (actionId === SHIFT_LIBRARY_ACTION_ID) setScreen("library")
    if (actionId === SHIFT_SETTINGS_ACTION_ID) setScreen("settings")
  }, [])

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
        status={model.settingsStatus}
        onChange={(settingId, value) => host.changeSetting(settingId, value)}
        onAction={actionId => host.runAction(actionId)}
        onDismissProblem={() => host.dismissSettingsProblem()}
        {...(model.clockLabel === undefined ? {} : { time: model.clockLabel })}
        onClose={() => setScreen("home")}
      />
    ) : screen === "library" && model.catalog._tag === "Loading" ? (
      <ShiftHomeLoadingBody />
    ) : screen === "library" && model.catalog._tag === "Error" ? (
      <ShiftHomeLoadErrorBody
        message={model.catalog.message}
        onRetry={() => host.reload()}
      />
    ) : screen === "library" ? (
      <ShiftLibraryGrid
        games={libraryGames}
        onSelect={gameId => {
          // Home already owns Korri's busy/failure/retry presentation. Return
          // there before launching so Library never hides launch feedback.
          setScreen("home")
          host.launchGame(gameId)
        }}
        onBack={() => setScreen("home")}
      />
    ) : model.catalog._tag === "Loading" ? (
      <ShiftHomeLoadingBody />
    ) : model.catalog._tag === "Error" ? (
      <ShiftHomeLoadErrorBody
        message={model.catalog.message}
        onRetry={() => host.reload()}
      />
    ) : model.catalog._tag === "Empty" && railActions.length > 0 ? (
      // A plugin can make the playable catalog empty. Settings must remain
      // reachable so the user can turn it back on rather than trapping the
      // device on an empty page.
      <ShiftCinematicHome
        games={[]}
        {...(model.clockLabel === undefined ? {} : { time: model.clockLabel })}
        status={model.status}
        actions={railActions}
        onAction={runRailAction}
        onRetry={() => host.retry()}
        onDismiss={() => host.dismiss()}
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
