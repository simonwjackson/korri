/**
 * Korri's launchables state, expressed in the surface treaty.
 *
 * This is the whole translation layer: everything a surface is allowed to know
 * is decided here, in one pure function, so no surface ever sees a bridge
 * result, a korrid outcome, or an error code. Anything Korri cannot honestly
 * report — cover art, playtime, genres — is simply absent rather than filled
 * in with a placeholder.
 */
import type {
  SurfaceAction,
  SurfaceCatalog,
  SurfaceGame,
  SurfaceModel,
  SurfaceStatus,
} from "@contracts/surface/korri-surface"
import {
  entryKey,
  type LaunchablesState,
  type PortalEntry,
} from "../launchables/state"

/** Section captions. Grouping is Korri's call; the surface only renders it. */
const SECTION_CONTINUE = "Continue"
const SECTION_THIS_DEVICE = "This device"

/** Non-game entries become rail actions rather than games. */
export function isActionEntry(entry: PortalEntry): boolean {
  return (
    entry.kind === "pairing" ||
    entry.kind === "storage-access" ||
    entry.kind === "background-notice"
  )
}

function actionFromEntry(entry: PortalEntry): SurfaceAction | null {
  switch (entry.kind) {
    case "pairing":
      return {
        id: entryKey(entry),
        label: "Pair a device",
        description: "Connect another device to stream from or play on.",
        enabled: true,
      }
    case "storage-access":
      return {
        id: entryKey(entry),
        label: "Allow file access",
        description:
          "Korri keeps your settings and games in a folder you can open.",
        enabled: true,
      }
    case "background-notice":
      return {
        id: entryKey(entry),
        label: entry.visible ? "Hide background notice" : "Show Korri running",
        description: entry.visible
          ? "Stop showing the notice that Korri is running."
          : "Show a notice while Korri keeps running in the background.",
        enabled: true,
      }
    default:
      return null
  }
}

function gameFromEntry(entry: PortalEntry): SurfaceGame | null {
  switch (entry.kind) {
    case "now-playing":
      return {
        id: entryKey(entry),
        title:
          entry.session.title ?? entry.session.gameId ?? "Current session",
        section: SECTION_CONTINUE,
        subtitle: entry.session.host ?? "Running now",
        resumable: true,
      }
    case "local-game":
      return {
        id: entryKey(entry),
        title: entry.game.title,
        section: SECTION_THIS_DEVICE,
        subtitle: entry.game.system,
      }
    case "game":
      return {
        id: entryKey(entry),
        title: entry.game.title,
        section: entry.game.host ?? "Other devices",
        ...(entry.game.host === undefined ? {} : { subtitle: entry.game.host }),
      }
    case "stream":
      return {
        id: entryKey(entry),
        title: entry.app.name,
        section: entry.hostName,
        subtitle: entry.hostName,
      }
    default:
      return null
  }
}

/**
 * The running session is the one game Korri can currently act on beyond
 * launching, so it is the only entry that carries a command sheet today.
 */
export function gameActionsForEntry(
  entry: PortalEntry | undefined,
): readonly SurfaceAction[] {
  if (entry?.kind !== "now-playing") return []
  return [
    { id: "resume", label: "Continue playing", enabled: true },
    { id: "stop", label: "Stop", enabled: true, destructive: true },
  ]
}

function statusFrom(state: LaunchablesState): SurfaceStatus {
  switch (state._tag) {
    case "Loading":
      return { _tag: "Browsing" }
    case "Preparing":
      return {
        _tag: "Busy",
        kicker: `Preparing ${state.title}…`,
        detail: "Your stream will start in a moment",
      }
    case "Launching":
      return {
        _tag: "Busy",
        kicker: `Starting ${state.title}…`,
        detail: "Opening your session",
      }
    case "Stopping":
      return {
        _tag: "Busy",
        kicker: "Stopping session…",
        detail: "Waiting for the host to finish",
      }
    case "Ready":
      return state.notice === null
        ? { _tag: "Browsing" }
        : {
            _tag: "Problem",
            kicker: "Couldn't start",
            reason: state.notice,
            // Nothing about the failure changed, so an immediate second
            // attempt would fail identically; the user acknowledges instead.
            canRetry: false,
          }
  }
}

function catalogFrom(state: LaunchablesState): SurfaceCatalog {
  if (state._tag === "Loading") return { _tag: "Loading" }
  const games = state.entries
    .map(gameFromEntry)
    .filter((game): game is SurfaceGame => game !== null)
  return games.length === 0
    ? { _tag: "Empty" }
    : { _tag: "Ready", games }
}

export function surfaceModelFrom(
  state: LaunchablesState,
  options: { readonly clockLabel?: string; readonly buildLabel?: string } = {},
): SurfaceModel {
  const actions =
    state._tag === "Loading"
      ? []
      : state.entries
          .map(actionFromEntry)
          .filter((action): action is SurfaceAction => action !== null)

  return {
    catalog: catalogFrom(state),
    status: statusFrom(state),
    actions,
    ...(options.clockLabel === undefined
      ? {}
      : { clockLabel: options.clockLabel }),
    ...(options.buildLabel === undefined
      ? {}
      : { buildLabel: options.buildLabel }),
  }
}

/** Find the entry a surface id refers to. Surface ids are entry keys. */
export function entryForId(
  state: LaunchablesState,
  id: string,
): PortalEntry | undefined {
  if (state._tag === "Loading") return undefined
  return state.entries.find(entry => entryKey(entry) === id)
}
