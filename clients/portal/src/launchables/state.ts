import type {
  LaunchAppResult,
  Launchable,
  QueryLaunchablesResult,
  QueryStreamAppsResult,
  StartStreamResult,
  StreamApp,
  StreamHost,
} from "@contracts/bridge/korri-native-bridge"
import type {
  CatalogSnapshotOutcome,
  Game,
  SessionPrepareOutcome,
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

export type LaunchablesState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "LoadError"; readonly message: string }
  | {
      readonly _tag: "Ready"
      readonly entries: readonly PortalEntry[]
      readonly selectedIndex: number
      readonly notice: string | null
    }

/** Minimal local Maybe until Effect's Option arrives with the RPC slice. */
export type Maybe<A> =
  | { readonly _tag: "Some"; readonly value: A }
  | { readonly _tag: "None" }

export interface Section {
  readonly title: string
  readonly startIndex: number
  readonly entries: readonly PortalEntry[]
}

export const entryKey = (entry: PortalEntry): string =>
  entry.kind === "game"
    ? `game:${entry.game.id}`
    : entry.kind === "local"
      ? `local:${entry.launchable.packageName}`
      : `stream:${entry.hostUuid}:${entry.app.id}`

export const entryLabel = (entry: PortalEntry): string =>
  entry.kind === "game"
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
  ): LaunchablesState => {
    const entries: PortalEntry[] = []
    const failures: string[] = []

    if (korrid._tag === "Ok") {
      for (const game of korrid.payload.games) entries.push({ kind: "game", game })
    } else {
      failures.push(`games: ${korrid.payload.code}`)
    }

    if (local._tag === "Launchables") {
      for (const launchable of local.items) entries.push({ kind: "local", launchable })
    } else {
      failures.push(`this device: ${local.message}`)
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

  selected: (state: LaunchablesState): Maybe<PortalEntry> => {
    if (state._tag !== "Ready") return { _tag: "None" }
    const entry = state.entries[state.selectedIndex]
    return entry === undefined
      ? { _tag: "None" }
      : { _tag: "Some", value: entry }
  },

  withLaunchResult: (
    state: LaunchablesState,
    result: LaunchAppResult,
  ): LaunchablesState => {
    if (state._tag !== "Ready") return state
    return result._tag === "Launched"
      ? { ...state, notice: null }
      : { ...state, notice: `${result.reason}: ${result.message}` }
  },

  withStartStreamResult: (
    state: LaunchablesState,
    result: StartStreamResult,
  ): LaunchablesState => {
    if (state._tag !== "Ready") return state
    return result._tag === "StreamStarted"
      ? { ...state, notice: null }
      : { ...state, notice: `${result.reason}: ${result.message}` }
  },

  withPrepareOutcome: (
    state: LaunchablesState,
    outcome: SessionPrepareOutcome,
  ): LaunchablesState => {
    if (state._tag !== "Ready") return state
    return outcome._tag === "Ok"
      ? { ...state, notice: null }
      : { ...state, notice: `${outcome.payload.code}: ${outcome.payload.message}` }
  },

  /** Group the flat entry list into titled sections for rendering. */
  sections: (
    state: Extract<LaunchablesState, { _tag: "Ready" }>,
  ): readonly Section[] => {
    const sections: Section[] = []
    let current: { title: string; startIndex: number; entries: PortalEntry[] } | null =
      null
    state.entries.forEach((entry, index) => {
      const title =
        entry.kind === "game"
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
