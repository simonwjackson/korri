import type {
  BackgroundNoticeResult,
  LaunchAppResult,
  Launchable,
  LaunchLocalResult,
  QueryLaunchablesResult,
  QueryStreamAppsResult,
  StartStreamResult,
  StorageAccessResult,
  StreamApp,
  StreamHost,
} from "@contracts/bridge/korri-native-bridge"
import type {
  ActiveSession,
  CatalogSnapshotOutcome,
  Game,
  LocalGame,
  LocalGameLaunchOutcome,
  LocalGamesListOutcome,
  SessionPrepareOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
} from "@contracts/generated/korrid"
import type { Direction } from "../input/types"

/**
 * Launchables screen state. Raw bridge results are converted into this ADT
 * at the seam; components never inspect bridge payloads directly.
 *
 * Entries come from three sources — korrid's game catalog, apps on this
 * device, and streamable apps on paired hosts — but once converted they
 * are one flat, ordered list with a single selection.
 */
export type PortalEntry =
  /**
   * Korri cannot reach its own settings, plugins, or local-game files until
   * the user grants file access. This is an entry rather than a passive
   * banner because the portal is controller-first: a message the user cannot
   * focus and confirm would be unreachable without a touchscreen.
   */
  | { readonly kind: "storage-access" }
  /**
   * Whether the user can see Korri running in the background. A setting
   * rather than a warning: the brain running on is what makes leaving a
   * game safe, so this exists to be seen and switched, not fixed.
   */
  | { readonly kind: "background-notice"; readonly visible: boolean }
  /**
   * Reaching the native pairing screen. Always present: pairing is how a
   * device joins the federation at all, so it must not be hidden behind
   * already having a device to show.
   */
  | { readonly kind: "pairing" }
  | { readonly kind: "now-playing"; readonly session: ActiveSession }
  | { readonly kind: "local-game"; readonly game: LocalGame }
  | { readonly kind: "game"; readonly game: Game }
  | { readonly kind: "local"; readonly launchable: Launchable }
  | {
      readonly kind: "stream"
      readonly hostUuid: string
      readonly hostName: string
      readonly app: StreamApp
    }

/** One paired host's app-query outcome, as gathered by the Root. */
export interface StreamSource {
  readonly host: StreamHost
  readonly apps: QueryStreamAppsResult
}

interface LaunchablesContent {
  readonly entries: readonly PortalEntry[]
  readonly selectedIndex: number
  readonly notice: string | null
}

type ReadyState = { readonly _tag: "Ready" } & LaunchablesContent
type PreparingState = {
  readonly _tag: "Preparing"
  readonly title: string
} & LaunchablesContent
type LaunchingState = {
  readonly _tag: "Launching"
  readonly title: string
} & LaunchablesContent
type StoppingState = {
  readonly _tag: "Stopping"
  readonly launchId: string
} & LaunchablesContent

export type LaunchablesState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "LoadError"; readonly message: string }
  | ReadyState
  | PreparingState
  | LaunchingState
  | StoppingState

/** Minimal local Maybe until Effect's Option arrives with the RPC slice. */
export type Maybe<A> =
  | { readonly _tag: "Some"; readonly value: A }
  | { readonly _tag: "None" }

export interface Section {
  readonly title: string
  readonly startIndex: number
  readonly entries: readonly PortalEntry[]
}

export const KORRI_STREAM_APP = "Korri Stream"

interface StreamTarget {
  readonly hostUuid: string
  readonly appId: number
}

const readyFrom = (
  state: LaunchablesContent,
  notice: string | null,
): ReadyState => ({
  _tag: "Ready",
  entries: state.entries,
  selectedIndex: state.selectedIndex,
  notice,
})

export const entryKey = (entry: PortalEntry): string => {
  switch (entry.kind) {
    case "background-notice":
      return "background-notice"
    case "storage-access":
      return "storage-access"
    case "pairing":
      return "pairing"
    case "now-playing":
      return `now-playing:${entry.session.launchId}`
    case "local-game":
      return `local-game:${entry.game.id}`
    case "game":
      return entry.game.host === undefined
        ? `game:${entry.game.id}`
        : `game:${entry.game.host}:${entry.game.id}`
    case "local":
      return `local:${entry.launchable.packageName}`
    case "stream":
      return `stream:${entry.hostUuid}:${entry.app.id}`
  }
}

export const entryLabel = (entry: PortalEntry): string =>
  entry.kind === "background-notice"
    ? entry.visible
      ? "Background notice: on — tap to hide it"
      : "Background notice: off — tap to show it"
    :
  entry.kind === "storage-access"
    ? "Korri needs file access — open settings"
    : entry.kind === "pairing"
      ? "Pair a device"
    : entry.kind === "now-playing"
    ? (entry.session.title ?? entry.session.gameId ?? "Current session")
    : entry.kind === "local-game" || entry.kind === "game"
      ? entry.game.title
      : entry.kind === "local"
        ? entry.launchable.label
        : entry.app.name

export const LaunchablesState = {
  loading: (): LaunchablesState => ({ _tag: "Loading" }),

  /**
   * Fold all sources into one state. Failed sources degrade to a notice;
   * only a total failure (no entries, at least one error) is a LoadError.
   */
  fromSources: (
    local: QueryLaunchablesResult,
    streams: readonly StreamSource[],
    korrid: CatalogSnapshotOutcome,
    hostsError?: string,
    session?: SessionStatusOutcome,
    localGames?: LocalGamesListOutcome,
    storage?: StorageAccessResult,
    notice?: BackgroundNoticeResult,
  ): LaunchablesState => {
    const entries: PortalEntry[] = []
    const failures: string[] = []

    // Denied file access comes first: without it Korri cannot read its own
    // settings, so it outranks everything else on screen. An inconclusive
    // query is not treated as denial — we do not nag on a failed check.
    if (storage?._tag === "Denied") {
      entries.push({ kind: "storage-access" })
    }

    // An active host session renders first as a now-playing banner. A
    // status failure degrades silently — no banner, no notice — rather
    // than blocking the list. `!= null` also remains compatible with older
    // korrid builds that emitted Option::None as explicit null.
    if (session?._tag === "Ok" && session.payload.active != null) {
      entries.push({ kind: "now-playing", session: session.payload.active })
    }

    if (localGames?._tag === "Ok") {
      for (const game of localGames.payload.games) {
        entries.push({ kind: "local-game", game })
      }
    } else if (localGames?._tag === "Err") {
      failures.push(`local games: ${localGames.payload.code}`)
    }

    if (korrid._tag === "Ok") {
      for (const game of korrid.payload.games) entries.push({ kind: "game", game })
      for (const failure of korrid.payload.failures ?? []) {
        failures.push(`${failure.host}: ${failure.code}`)
      }
    } else {
      failures.push(`games: ${korrid.payload.code}`)
    }


    if (hostsError !== undefined) failures.push(`stream hosts: ${hostsError}`)

    for (const source of streams) {
      if (source.apps._tag === "StreamApps") {
        for (const app of source.apps.items) {
          entries.push({
            kind: "stream",
            hostUuid: source.host.uuid,
            hostName: source.host.name,
            app,
          })
        }
      } else {
        failures.push(`${source.host.name}: ${source.apps.message}`)
      }
    }

    // Pairing is always reachable. It is how a device joins at all, so
    // it cannot be conditional on already having something to show.
    entries.push({ kind: "pairing" })

    // Korri keeps its brain running after you leave, and the user is
    // entitled to see that and switch it off. Always present, and last:
    // it is a setting, not something to play.
    entries.push({ kind: "background-notice", visible: notice?._tag === "Visible" })

    if (entries.length === 0 && failures.length > 0) {
      return { _tag: "LoadError", message: failures.join(" · ") }
    }
    return {
      _tag: "Ready",
      entries,
      selectedIndex: 0,
      notice: failures.length > 0 ? failures.join(" · ") : null,
    }
  },

  /** Replace the notice on a Ready state, leaving entries and selection alone. */
  withNotice: (state: ReadyState, notice: string): ReadyState => ({
    ...state,
    notice,
  }),

  /** Select one stable Sunshine app, constrained to a game's origin host. */
  korriStreamTarget: (
    streams: readonly StreamSource[],
    hostName?: string,
  ): Maybe<StreamTarget> => {
    const candidates =
      hostName === undefined
        ? streams
        : streams.filter(source => source.host.name === hostName)
    for (const source of candidates) {
      if (source.apps._tag !== "StreamApps") continue
      const app = source.apps.items.find(app => app.name === KORRI_STREAM_APP)
      if (app !== undefined) {
        return {
          _tag: "Some",
          value: { hostUuid: source.host.uuid, appId: app.id },
        }
      }
    }
    return { _tag: "None" }
  },

  /** Confirm on a game: enter an input-locked case until activity swap. */
  beginPreparing: (state: LaunchablesState, title: string): LaunchablesState =>
    state._tag === "Ready"
      ? { ...state, _tag: "Preparing", title, notice: null }
      : state,

  /** Lock all direct local/stream/resume starts before their Promise runs. */
  beginLaunching: (state: LaunchablesState, title: string): LaunchablesState =>
    state._tag === "Ready"
      ? { ...state, _tag: "Launching", title, notice: null }
      : state,

  moveSelection: (
    state: LaunchablesState,
    direction: Direction,
  ): LaunchablesState => {
    if (state._tag !== "Ready" || state.entries.length === 0) return state
    const delta = direction === "down" ? 1 : direction === "up" ? -1 : 0
    if (delta === 0) return state
    const last = state.entries.length - 1
    const next = Math.min(last, Math.max(0, state.selectedIndex + delta))
    return next === state.selectedIndex
      ? state
      : { ...state, selectedIndex: next, notice: null }
  },

  /**
   * Move selection to an exact entry, as a pointer does. Out-of-range indices
   * are ignored rather than clamped: a stale index from a list that changed
   * under the user should do nothing, not activate a neighbour.
   */
  selectIndex: (state: LaunchablesState, index: number): LaunchablesState => {
    if (state._tag !== "Ready") return state
    if (index < 0 || index >= state.entries.length) return state
    return index === state.selectedIndex
      ? state
      : { ...state, selectedIndex: index, notice: null }
  },

  selected: (state: LaunchablesState): Maybe<PortalEntry> => {
    if (state._tag !== "Ready") return { _tag: "None" }
    const entry = state.entries[state.selectedIndex]
    return entry === undefined
      ? { _tag: "None" }
      : { _tag: "Some", value: entry }
  },

  withLocalLaunchOutcome: (
    state: LaunchablesState,
    outcome: LocalGameLaunchOutcome,
  ): LaunchablesState => {
    if (state._tag !== "Launching") return state
    return outcome._tag === "Ok"
      ? state
      : readyFrom(
          state,
          `${outcome.payload.code}: ${outcome.payload.message}`,
        )
  },

  withLocalLaunchResult: (
    state: LaunchablesState,
    result: LaunchLocalResult,
  ): LaunchablesState => {
    if (state._tag !== "Launching") return state
    return result._tag === "Launched"
      ? state
      : readyFrom(state, `${result.reason}: ${result.message}`)
  },

  withLaunchResult: (
    state: LaunchablesState,
    result: LaunchAppResult,
  ): LaunchablesState => {
    if (state._tag !== "Launching") return state
    return result._tag === "Launched"
      ? { ...state, notice: null }
      : readyFrom(state, `${result.reason}: ${result.message}`)
  },

  withStartStreamResult: (
    state: LaunchablesState,
    result: StartStreamResult,
  ): LaunchablesState => {
    if (state._tag !== "Launching" && state._tag !== "Preparing") return state
    if (result._tag === "StreamStarted") return { ...state, notice: null }
    return readyFrom(state, `${result.reason}: ${result.message}`)
  },

  withPrepareOutcome: (
    state: LaunchablesState,
    outcome: SessionPrepareOutcome,
  ): LaunchablesState => {
    if (state._tag !== "Preparing") return state
    if (outcome._tag === "Ok") return { ...state, notice: null }
    return readyFrom(
      state,
      `${outcome.payload.code}: ${outcome.payload.message}`,
    )
  },

  /** Lock input before the asynchronous stop request leaves the portal. */
  beginStopping: (state: LaunchablesState): LaunchablesState => {
    if (state._tag !== "Ready") return state
    const selected = state.entries[state.selectedIndex]
    if (selected?.kind !== "now-playing") return state
    return {
      ...state,
      _tag: "Stopping",
      launchId: selected.session.launchId,
      notice: null,
    }
  },

  /** A successful stop request is not the same as an ended session. */
  withStopOutcome: (
    state: LaunchablesState,
    outcome: SessionStopOutcome,
  ): LaunchablesState => {
    if (state._tag !== "Stopping") return state
    return outcome._tag === "Ok"
      ? state
      : readyFrom(
          state,
          `${outcome.payload.code}: ${outcome.payload.message}`,
        )
  },

  /** Fold a status poll while stopping; only idle removes the banner. */
  withStatusAfterStop: (
    state: LaunchablesState,
    status: SessionStatusOutcome,
  ): LaunchablesState => {
    if (state._tag !== "Stopping") return state
    if (status._tag === "Err") {
      return readyFrom(
        state,
        `${status.payload.code}: ${status.payload.message}`,
      )
    }
    if (
      status.payload.active != null &&
      status.payload.active.launchId === state.launchId
    ) {
      return state
    }
    return {
      ...readyFrom(state, null),
      entries: state.entries.filter(entry => entry.kind !== "now-playing"),
    }
  },

  stopTimedOut: (state: LaunchablesState): LaunchablesState =>
    state._tag === "Stopping"
      ? readyFrom(state, "StopPending: session is still stopping")
      : state,

  /** Group the flat entry list into titled sections for rendering. */
  sections: (
    state: Extract<LaunchablesState, { _tag: "Ready" }>,
  ): readonly Section[] => {
    const sections: Section[] = []
    let current: { title: string; startIndex: number; entries: PortalEntry[] } | null =
      null
    state.entries.forEach((entry, index) => {
      const title =
        entry.kind === "storage-access"
          ? "Needs your attention"
          : entry.kind === "background-notice"
          ? "Settings"
          : entry.kind === "pairing"
          ? "Devices"
          : entry.kind === "now-playing"
          ? "Now playing"
          : entry.kind === "local-game"
            ? "Local games"
            : entry.kind === "game"
              ? "Games"
              : entry.kind === "local"
              ? "This device"
              : entry.hostName
      if (current === null || current.title !== title) {
        current = { title, startIndex: index, entries: [] }
        sections.push(current)
      }
      current.entries.push(entry)
    })
    return sections
  },
}
