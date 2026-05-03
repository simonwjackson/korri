import {
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react"
import type { GameRecord } from "@shared/fixtures/games/game"
import { getGameDisplayName } from "@shared/fixtures/games/game"
import { Option } from "effect"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { launchAtom, libraryItemsAtom } from "./library-atoms"
import {
  type LaunchState,
  LaunchState as LaunchStateModel,
  type LibraryListState,
  LibraryListState as LibraryListStateModel,
} from "./library-list-state"

interface LaunchController {
  readonly state: LaunchState
  readonly start: (game: GameRecord) => void
}

const LibraryListStateContext = createContext<LibraryListState | null>(null)
const LibraryLaunchStateContext = createContext<LaunchState | null>(null)

export function LibraryList() {
  const items = useAtomValue(libraryItemsAtom)
  const refreshItems = useAtomRefresh(libraryItemsAtom)
  const launch = useLibraryLaunchController()

  return (
    <main className="min-h-screen bg-zinc-950 px-8 py-10 text-zinc-50">
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <LibraryListHeader />

        <LibraryLaunchStateRoot state={launch.state}>
          <LibraryLaunchLaunching />
          <LibraryLaunchFailed />
          <LibraryLaunchLaunched />
          <LibraryLaunchDefect />
        </LibraryLaunchStateRoot>

        <LibraryListStateRoot result={items}>
          <LibraryListLoading />
          <LibraryListLoadError onRetry={refreshItems} />
          <LibraryListDefect />
          <LibraryListReady launch={launch} />
        </LibraryListStateRoot>
      </section>
    </main>
  )
}

function LibraryListHeader() {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-300">
        Effect atoms spike
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">LibraryList</h1>
      <p className="max-w-2xl text-base text-zinc-400">
        Layer-swapped data, FP state adapters, self-selecting state components,
        and a real in-memory launch service — no network or global test doubles.
      </p>
    </header>
  )
}

function LibraryListStateRoot({
  result,
  children,
}: {
  readonly result: Parameters<typeof LibraryListStateModel.fromResult>[0]
  readonly children: ReactNode
}) {
  const state = LibraryListStateModel.fromResult(result)

  return (
    <LibraryListStateContext.Provider value={state}>
      {children}
    </LibraryListStateContext.Provider>
  )
}

function LibraryLaunchStateRoot({
  state,
  children,
}: {
  readonly state: LaunchState
  readonly children: ReactNode
}) {
  return (
    <LibraryLaunchStateContext.Provider value={state}>
      {children}
    </LibraryLaunchStateContext.Provider>
  )
}

function LibraryListLoading() {
  const loading = useLibraryListCase("Loading")

  return Option.match(loading, {
    onNone: () => null,
    onSome: () => (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl shadow-black/20">
        <div className="h-3 w-24 rounded-full bg-amber-300/40" />
        <div className="mt-6 grid gap-4">
          <div className="h-16 rounded-xl bg-zinc-800/70" />
          <div className="h-16 rounded-xl bg-zinc-800/50" />
          <div className="h-16 rounded-xl bg-zinc-800/30" />
        </div>
        <p className="mt-5 text-sm text-zinc-400">Loading library…</p>
      </div>
    ),
  })
}

function LibraryListLoadError({ onRetry }: { readonly onRetry: () => void }) {
  const loadError = useLibraryListCase("LoadError")

  return Option.match(loadError, {
    onNone: () => null,
    onSome: ({ error }) => (
      <div
        role="alert"
        className="rounded-2xl border border-red-400/40 bg-red-950/50 p-6 text-red-50"
      >
        <p className="text-lg font-semibold">Library failed to load</p>
        <p className="mt-2 text-sm text-red-100/80">
          Reason: {error.reason}
          {error.message ? ` — ${error.message}` : ""}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-red-200 px-4 py-2 text-sm font-semibold text-red-950 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-100 focus:ring-offset-2 focus:ring-offset-red-950"
        >
          Retry list
        </button>
      </div>
    ),
  })
}

function LibraryListDefect() {
  const defect = useLibraryListCase("Defect")

  return Option.match(defect, {
    onNone: () => null,
    onSome: ({ defect }) => (
      <div
        role="alert"
        className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-950/40 p-6 text-fuchsia-50"
      >
        <p className="text-lg font-semibold">Unexpected defect</p>
        <p className="mt-2 text-sm text-fuchsia-100/80">{String(defect)}</p>
      </div>
    ),
  })
}

function LibraryListReady({ launch }: { readonly launch: LaunchController }) {
  const ready = useLibraryListCase("Ready")

  return Option.match(ready, {
    onNone: () => null,
    onSome: ({ games }) => (
      <LibraryListReadyView games={games} launch={launch} />
    ),
  })
}

function LibraryListReadyView({
  games,
  launch,
}: {
  readonly games: readonly GameRecord[]
  readonly launch: LaunchController
}) {
  const disabled = LaunchStateModel.isLaunching(launch.state)

  return (
    <div className="grid gap-3" data-testid="spike-library-list">
      {games.map(game => (
        <button
          key={game.id}
          type="button"
          disabled={disabled}
          onClick={() => launch.start(game)}
          className="group flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-4 text-left shadow-xl shadow-black/10 transition hover:border-amber-300/60 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-wait disabled:opacity-70"
        >
          <span className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-zinc-50">
              {getGameDisplayName(game)}
            </span>
            <span className="text-sm text-zinc-400">
              {(game.metadata?.genre ?? ["Unknown genre"]).join(" / ")}
            </span>
          </span>
          <span className="rounded-full border border-amber-300/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200 group-hover:bg-amber-300 group-hover:text-zinc-950">
            Launch
          </span>
        </button>
      ))}
    </div>
  )
}

function LibraryLaunchLaunching() {
  const launching = useLaunchCase("Launching")

  return Option.match(launching, {
    onNone: () => null,
    onSome: () => (
      <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
        Launching selected game…
      </div>
    ),
  })
}

function LibraryLaunchFailed() {
  const failed = useLaunchCase("Failed")

  return Option.match(failed, {
    onNone: () => null,
    onSome: ({ exitCode }) => (
      <div
        role="alert"
        className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-50"
      >
        Launch command failed with exit code {exitCode}.
      </div>
    ),
  })
}

function LibraryLaunchLaunched() {
  const launched = useLaunchCase("Launched")

  return Option.match(launched, {
    onNone: () => null,
    onSome: () => (
      <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
        Launch completed successfully.
      </div>
    ),
  })
}

function LibraryLaunchDefect() {
  const launchDefect = useLaunchCase("Defect")

  return Option.match(launchDefect, {
    onNone: () => null,
    onSome: ({ defect }) => (
      <div
        role="alert"
        className="rounded-xl border border-red-400/40 bg-red-950/50 px-4 py-3 text-sm text-red-50"
      >
        Launch effect defect: {String(defect)}
      </div>
    ),
  })
}

function useLibraryLaunchController(): LaunchController {
  const launch = useAtomSet(launchAtom, { mode: "promiseExit" })
  const [state, setState] = useState<LaunchState>(LaunchStateModel.idle)

  const start = useCallback(
    (game: GameRecord) => {
      setState(LaunchStateModel.launching(game.id))
      void launch(game.id).then(exit => {
        setState(LaunchStateModel.fromExit(game.id, exit))
      })
    },
    [launch],
  )

  return useMemo(() => ({ state, start }), [state, start])
}

function useLibraryListState(): LibraryListState {
  const state = useContext(LibraryListStateContext)
  if (!state) {
    throw new Error(
      "LibraryList state components must be used inside LibraryListStateRoot",
    )
  }
  return state
}

function useLibraryLaunchState(): LaunchState {
  const state = useContext(LibraryLaunchStateContext)
  if (!state) {
    throw new Error(
      "Library launch state components must be used inside LibraryLaunchStateRoot",
    )
  }
  return state
}

function useLibraryListCase<Tag extends LibraryListState["_tag"]>(
  tag: Tag,
): Option.Option<Extract<LibraryListState, { readonly _tag: Tag }>> {
  return LibraryListStateModel.select(tag)(useLibraryListState())
}

function useLaunchCase<Tag extends LaunchState["_tag"]>(
  tag: Tag,
): Option.Option<Extract<LaunchState, { readonly _tag: Tag }>> {
  return LaunchStateModel.select(tag)(useLibraryLaunchState())
}
