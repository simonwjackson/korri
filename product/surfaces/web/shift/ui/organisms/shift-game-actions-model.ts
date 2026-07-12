/**
 * Shift game actions model — the fixed command catalog for one game.
 *
 * The sheet shows *every* action the system can take on a game, grouped and in a
 * stable order, for every game. Whether a row responds is derived here, purely,
 * from two things:
 *   - applicability: does the action fit this game's current state? (Stop only
 *     when it's running, New Game only once played, Remove only for local
 *     content, …)
 *   - wiring: did the host hand in a handler for it yet?
 * An action is enabled only when it is both applicable and wired; otherwise it
 * renders present-but-disabled. Labels that flip on state (Play/Continue,
 * Favorite/Unfavorite) resolve here too. Kept free of React and icons so the
 * rules are directly unit-testable; the view maps ids to glyphs.
 */

import type { ShiftSheetActionTone } from "../molecules/ShiftSheetAction"

/** Current game state the applicability rules read. */
export interface ShiftGameActionsState {
  readonly favorite: boolean
  /** Has any recorded play history (drives Continue vs Play, and New Game). */
  readonly played: boolean
  /** This game is the running foreground session. */
  readonly running: boolean
  /** Number of launchable releases (drives Play with… and Manage releases). */
  readonly releaseCount: number
  /** A provider/source link exists (drives View in source). */
  readonly hasProviderLink: boolean
  /** Content is locally owned (drives Remove). */
  readonly local: boolean
}

/** Handlers the host wires as backends land. Absent handler ⇒ disabled row. */
export interface ShiftGameActionsHandlers {
  readonly onPlay?: () => void
  readonly onNewGame?: () => void
  readonly onPlayWith?: () => void
  readonly onStream?: () => void
  readonly onStop?: () => void
  readonly onToggleFavorite?: () => void
  readonly onAddToCollection?: () => void
  readonly onOpenDetails?: () => void
  readonly onReacquire?: () => void
  readonly onViewInSource?: () => void
  readonly onManageReleases?: () => void
  readonly onGameSettings?: () => void
  readonly onDefaultRuntime?: () => void
  readonly onRemove?: () => void
}

export interface ShiftGameActionsInput {
  readonly state: ShiftGameActionsState
  readonly handlers: ShiftGameActionsHandlers
}

/** A resolved row: stable id, resolved label, enablement, and (when enabled) the
 * command to run. `onSelect` is present only when the row is enabled. */
export interface ShiftGameActionView {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  readonly tone?: ShiftSheetActionTone
  readonly onSelect?: () => void
}

export interface ShiftGameActionGroupView {
  readonly id: string
  readonly title: string
  readonly actions: readonly ShiftGameActionView[]
}

interface ActionSpec {
  readonly id: string
  readonly label: string
  readonly applicable: boolean
  readonly handler: (() => void) | undefined
  readonly tone?: ShiftSheetActionTone
}

interface GroupSpec {
  readonly id: string
  readonly title: string
  readonly actions: readonly ActionSpec[]
}

function resolve(action: ActionSpec): ShiftGameActionView {
  const enabled = action.applicable && action.handler !== undefined
  return {
    id: action.id,
    label: action.label,
    enabled,
    ...(action.tone ? { tone: action.tone } : {}),
    ...(enabled && action.handler ? { onSelect: action.handler } : {}),
  }
}

export function shiftGameActionsModel({
  state,
  handlers,
}: ShiftGameActionsInput): readonly ShiftGameActionGroupView[] {
  const groups: readonly GroupSpec[] = [
    {
      id: "play",
      title: "Play",
      actions: [
        {
          id: "play",
          label: state.played ? "Continue" : "Play",
          applicable: true,
          handler: handlers.onPlay,
        },
        {
          id: "new-game",
          label: "New Game",
          applicable: state.played,
          handler: handlers.onNewGame,
        },
        {
          id: "play-with",
          label: "Play with…",
          applicable: state.releaseCount > 1,
          handler: handlers.onPlayWith,
        },
        {
          id: "stream",
          label: "Stream to another device",
          applicable: true,
          handler: handlers.onStream,
        },
        {
          id: "stop",
          label: "Stop",
          applicable: state.running,
          handler: handlers.onStop,
        },
      ],
    },
    {
      id: "organize",
      title: "Organize",
      actions: [
        {
          id: "favorite",
          label: state.favorite ? "Unfavorite" : "Favorite",
          applicable: true,
          handler: handlers.onToggleFavorite,
        },
        {
          id: "add-to-collection",
          label: "Add to collection…",
          applicable: true,
          handler: handlers.onAddToCollection,
        },
        {
          id: "open-details",
          label: "Open details",
          applicable: true,
          handler: handlers.onOpenDetails,
        },
      ],
    },
    {
      id: "content",
      title: "Content",
      actions: [
        {
          id: "reacquire",
          label: "Verify / re-download",
          applicable: true,
          handler: handlers.onReacquire,
        },
        {
          id: "view-in-source",
          label: "View in source",
          applicable: state.hasProviderLink,
          handler: handlers.onViewInSource,
        },
        {
          id: "manage-releases",
          label: "Manage releases",
          applicable: state.releaseCount > 0,
          handler: handlers.onManageReleases,
        },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      actions: [
        {
          id: "game-settings",
          label: "Game settings",
          applicable: true,
          handler: handlers.onGameSettings,
        },
        {
          id: "default-runtime",
          label: "Default launcher / core",
          applicable: true,
          handler: handlers.onDefaultRuntime,
        },
      ],
    },
    {
      id: "danger",
      title: "Danger",
      actions: [
        {
          id: "remove",
          label: "Remove from library",
          applicable: state.local,
          handler: handlers.onRemove,
          tone: "danger",
        },
      ],
    },
  ]

  return groups.map(group => ({
    id: group.id,
    title: group.title,
    actions: group.actions.map(resolve),
  }))
}
