import { type Dirent, type FSWatcher, watch } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { logger } from "@platform/logger"
import { Effect, Exit, Scope } from "effect"
import type { PlayableLibraryEntry } from "./playable-library"
import type {
  KorriConfigGraphDb,
  KorriConfigGraphRoot,
} from "./proseql/config-graph-db"
import { openKorriConfigGraph } from "./proseql/config-graph-db"

/**
 * One fragment-level containment outcome from the last (re)build: a broken
 * or out-of-scope piece of config that was skipped or ignored instead of
 * failing the graph. Serialized over `/api/config/events` so operators and
 * agents can see why a record is missing.
 */
export interface ConfigGraphDiagnostic {
  readonly rootId: string
  readonly action: "skipped-fragment" | "skipped-root" | "ignored-collection"
  readonly message: string
  readonly path?: string
  readonly collection?: string
}

import { createLibraryRepository } from "./proseql/library-repository"

export type ConfigGraphEventName =
  | "config.ready"
  | "config.changed"
  | "config.invalid"

export type ConfigGraphStatus = "valid" | "invalid"

/**
 * One config-graph lifecycle event broadcast to subscribers (and serialized
 * over `/api/config/events`).
 *
 * - `generation` is the active last-known-good generation; it only advances on
 *   a valid (re)build and is retained on invalid attempts.
 * - `attempt` is a monotonically increasing rebuild-attempt counter.
 * - valid events include `files`; invalid events include `message`.
 * - `changedPath` (relative) is present when a specific watched fragment
 *   triggered the rebuild.
 * - `diagnostics` is present when the build skipped or ignored fragments
 *   (broken card files, out-of-scope sections) instead of failing.
 */
export interface ConfigGraphEvent {
  readonly name: ConfigGraphEventName
  readonly generation: number
  readonly attempt: number
  readonly status: ConfigGraphStatus
  readonly files?: readonly string[]
  readonly message?: string
  readonly changedPath?: string
  readonly diagnostics?: readonly ConfigGraphDiagnostic[]
}

export interface ConfigGraphController {
  /** Build the initial graph and return the resulting `config.ready` event. */
  readonly initialize: () => Promise<ConfigGraphEvent>
  /** Attempt a rebuild and return the resulting changed/invalid event. */
  readonly rebuild: (changedPath?: string) => Promise<ConfigGraphEvent>
  /** Subscribe to events; the current `config.ready` is delivered immediately. */
  readonly subscribe: (
    listener: (event: ConfigGraphEvent) => void,
  ) => () => void
  /** Last-known-good readable playable entries. */
  readonly snapshot: () => Promise<readonly PlayableLibraryEntry[]>
  /** Run a read operation against the active last-known-good config graph DB. */
  readonly withActiveDb: <T, E>(
    useDb: (db: KorriConfigGraphDb) => Effect.Effect<T, E>,
  ) => Effect.Effect<T, E | Error>
  /** Current lifecycle state as a `config.ready` event. */
  readonly state: () => ConfigGraphEvent
  /** Stop watchers and release resources. */
  readonly stop: () => Promise<void>
}

/**
 * Root supply is a discriminated pair: exactly one of `roots` (static,
 * frozen for the controller's lifetime) or `resolveRoots` (dynamic, called
 * at every (re)build so roots added or removed at runtime — removable
 * media — join or leave the graph). Passing neither is a type error.
 */
export type ConfigGraphControllerOptions = (
  | {
      readonly roots: readonly KorriConfigGraphRoot[]
      readonly resolveRoots?: undefined
    }
  | {
      readonly roots?: undefined
      readonly resolveRoots: () => readonly KorriConfigGraphRoot[]
    }
) & {
  /**
   * Directory whose child entries signal a root-set change (one symlink per
   * dynamically mounted config root). Watched non-recursively; any child
   * add/remove debounces into a coarse re-resolve + rebuild.
   */
  readonly rootsSignalDir?: string
  /** Wire filesystem watchers (default true). Tests drive `rebuild` directly. */
  readonly watch?: boolean
  readonly debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 250

const CONFIG_FRAGMENT_RE = /(?:^|\.)korri\.[^.]+$/

function isConfigFragment(name: string): boolean {
  return CONFIG_FRAGMENT_RE.test(name)
}

async function discoverFragments(
  roots: readonly KorriConfigGraphRoot[],
): Promise<string[]> {
  const found: string[] = []
  for (const { root } of roots) {
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[]
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (entry.isFile() && isConfigFragment(entry.name)) {
          found.push(relative(root, full))
        }
      }
    }
    await walk(root)
  }
  return found.sort()
}

interface ConfigGraphSnapshot {
  readonly entries: readonly PlayableLibraryEntry[]
  readonly diagnostics: readonly ConfigGraphDiagnostic[]
}

interface ConfigGraphBuild extends ConfigGraphSnapshot {
  readonly db: KorriConfigGraphDb
  readonly scope: Scope.Scope
}

interface ActiveGraph {
  readonly db: KorriConfigGraphDb
  readonly scope: Scope.Scope
  readonly generation: number
  leases: number
  closeRequested: boolean
  closeStarted: boolean
  readonly closed: Promise<void>
  readonly resolveClosed: () => void
}

function diagnosticsFromDb(
  diagnostics: readonly {
    readonly rootId: string
    readonly action: ConfigGraphDiagnostic["action"]
    readonly message: string
    readonly path?: string
    readonly collection?: string
  }[],
): readonly ConfigGraphDiagnostic[] {
  return diagnostics.map(diagnostic => ({
    rootId: diagnostic.rootId,
    action: diagnostic.action,
    message: diagnostic.message,
    ...(diagnostic.path !== undefined ? { path: diagnostic.path } : {}),
    ...(diagnostic.collection !== undefined
      ? { collection: diagnostic.collection }
      : {}),
  }))
}

async function loadGraph(
  roots: readonly KorriConfigGraphRoot[],
): Promise<ConfigGraphBuild> {
  const scope = Scope.makeUnsafe()
  try {
    const db = await Effect.runPromise(
      openKorriConfigGraph({ roots }).pipe(
        Effect.provideService(Scope.Scope, scope),
      ),
    )
    const { entries, diagnostics } = await Effect.runPromise(
      Effect.gen(function* () {
        const entries = yield* createLibraryRepository(db).listPlayableEntries()
        const diagnostics = yield* db.$documentGraph.getDiagnostics()
        return { entries, diagnostics }
      }),
    )
    return {
      db,
      scope,
      entries,
      diagnostics: diagnosticsFromDb(diagnostics),
    }
  } catch (error) {
    await Effect.runPromise(Scope.close(scope, Exit.void)).catch(closeError =>
      logger.warn(
        { err: closeError },
        "config-graph: failed to close rejected graph scope",
      ),
    )
    throw error
  }
}

export function createConfigGraphController(
  options: ConfigGraphControllerOptions,
): ConfigGraphController {
  const staticRoots = options.roots
  const resolveRoots = options.resolveRoots ?? (() => staticRoots ?? [])
  // Serializes initialize/rebuild executions (single-flight): a rebuild
  // fired while another is in flight waits for it, then re-resolves roots,
  // so the final state always reflects the newest root set instead of
  // whichever overlapping build happened to finish last.
  let buildChain: Promise<unknown> = Promise.resolve()

  const enqueueBuild = <T>(run: () => Promise<T>): Promise<T> => {
    const next = buildChain.then(run)
    buildChain = next.catch(() => undefined)
    return next
  }
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const shouldWatch = options.watch ?? true

  let generation = 0
  let attempt = 0
  let status: ConfigGraphStatus = "valid"
  let files: readonly string[] = []
  let message: string | undefined
  let diagnostics: readonly ConfigGraphDiagnostic[] = []
  let lastGood: readonly PlayableLibraryEntry[] = []
  let activeGraph: ActiveGraph | undefined
  let stopping = false

  const listeners = new Set<(event: ConfigGraphEvent) => void>()
  const contentWatchers: FSWatcher[] = []
  let watchedRoots: readonly string[] = []
  let signalWatcher: FSWatcher | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined
  let pendingPath: string | undefined

  const readyEvent = (): ConfigGraphEvent => ({
    name: "config.ready",
    generation,
    attempt,
    status,
    files,
    ...(message !== undefined ? { message } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  })

  const publish = (event: ConfigGraphEvent): void => {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (error) {
        logger.warn({ err: error }, "config-graph: subscriber threw")
      }
    }
  }

  const closeGraphNow = async (graph: ActiveGraph): Promise<void> => {
    if (graph.closeStarted) return graph.closed
    graph.closeStarted = true
    try {
      await Effect.runPromise(Scope.close(graph.scope, Exit.void))
    } finally {
      graph.resolveClosed()
    }
  }

  const requestCloseGraph = async (graph: ActiveGraph): Promise<void> => {
    graph.closeRequested = true
    if (graph.leases === 0) await closeGraphNow(graph)
    else await graph.closed
  }

  const makeActiveGraph = (
    build: ConfigGraphBuild,
    activeGeneration: number,
  ): ActiveGraph => {
    let resolveClosed: () => void = () => undefined
    const closed = new Promise<void>(resolve => {
      resolveClosed = resolve
    })
    return {
      db: build.db,
      scope: build.scope,
      generation: activeGeneration,
      leases: 0,
      closeRequested: false,
      closeStarted: false,
      closed,
      resolveClosed,
    }
  }

  const acquireActiveGraph = (): ActiveGraph => {
    const graph = activeGraph
    if (stopping || graph === undefined || graph.closeRequested) {
      throw new Error("config graph is not ready")
    }
    graph.leases += 1
    return graph
  }

  const releaseActiveGraph = async (graph: ActiveGraph): Promise<void> => {
    graph.leases = Math.max(0, graph.leases - 1)
    if (graph.closeRequested && graph.leases === 0) {
      await closeGraphNow(graph)
    }
  }

  const replaceActiveGraph = async (build: ConfigGraphBuild): Promise<void> => {
    const previous = activeGraph
    activeGraph = makeActiveGraph(build, generation)
    if (previous) await requestCloseGraph(previous)
  }

  const attemptBuild = async (
    name: ConfigGraphEventName,
    roots: readonly KorriConfigGraphRoot[],
    changedPath?: string,
  ): Promise<ConfigGraphEvent> => {
    attempt += 1
    try {
      const [build, discovered] = await Promise.all([
        loadGraph(roots),
        discoverFragments(roots),
      ])
      lastGood = build.entries
      files = discovered
      message = undefined
      diagnostics = build.diagnostics
      generation += 1
      await replaceActiveGraph(build)
      status = "valid"
      const event: ConfigGraphEvent = {
        name,
        generation,
        attempt,
        status,
        files,
        ...(changedPath !== undefined ? { changedPath } : {}),
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      }
      return event
    } catch (error) {
      status = "invalid"
      message = error instanceof Error ? error.message : String(error)
      const event: ConfigGraphEvent = {
        name: name === "config.ready" ? "config.ready" : "config.invalid",
        generation,
        attempt,
        status,
        message,
        ...(changedPath !== undefined ? { changedPath } : {}),
      }
      return event
    }
  }

  const scheduleRebuild = (filename: string | undefined): void => {
    pendingPath = filename
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = undefined
      const changedPath = pendingPath
      pendingPath = undefined
      void rebuild(changedPath).catch(error =>
        logger.warn({ err: error }, "config-graph: rebuild failed"),
      )
    }, debounceMs)
  }

  const closeContentWatchers = (): void => {
    for (const watcher of contentWatchers) watcher.close()
    contentWatchers.length = 0
    watchedRoots = []
  }

  const startContentWatchers = (
    roots: readonly KorriConfigGraphRoot[],
  ): void => {
    for (const { root } of roots) {
      try {
        const watcher = watch(
          root,
          { persistent: false, recursive: true },
          (_eventType, filename) => {
            if (filename && !isConfigFragment(filename.toString())) return
            scheduleRebuild(filename ? filename.toString() : undefined)
          },
        )
        watcher.on("error", error =>
          logger.warn({ err: error, root }, "config-graph: watcher failed"),
        )
        contentWatchers.push(watcher)
      } catch (error) {
        logger.warn(
          { err: error, root },
          "config-graph: failed to watch config root",
        )
      }
    }
    watchedRoots = roots.map(({ root }) => root)
  }

  const startSignalWatcher = (): void => {
    const signalDir = options.rootsSignalDir
    if (signalDir === undefined) return
    try {
      // Non-recursive child watch: recursive fs.watch does not descend into
      // mountpoints reliably on Linux, so we never watch *through* a mount —
      // only the set of mounts published into the signal dir.
      const watcher = watch(
        signalDir,
        { persistent: false, recursive: false },
        (_eventType, filename) => {
          scheduleRebuild(filename ? filename.toString() : undefined)
        },
      )
      watcher.on("error", error =>
        logger.warn(
          { err: error, signalDir },
          "config-graph: roots signal watcher failed",
        ),
      )
      signalWatcher = watcher
    } catch (error) {
      logger.warn(
        { err: error, signalDir },
        "config-graph: failed to watch roots signal dir; serving static roots",
      )
    }
  }

  const sameRootSet = (roots: readonly KorriConfigGraphRoot[]): boolean =>
    roots.length === watchedRoots.length &&
    roots.every(({ root }, index) => watchedRoots[index] === root)

  const initialize = (): Promise<ConfigGraphEvent> =>
    enqueueBuild(async () => {
      stopping = false
      const roots = resolveRoots()
      const event = await attemptBuild("config.ready", roots)
      if (shouldWatch && !stopping) {
        startContentWatchers(roots)
        startSignalWatcher()
      }
      return event
    })

  const rebuild = (changedPath?: string): Promise<ConfigGraphEvent> =>
    enqueueBuild(async () => {
      if (stopping) return readyEvent()
      // Coarse re-resolve: every rebuild re-reads the root set so dynamically
      // mounted roots join (or leave) the graph regardless of which watcher
      // fired. Content watchers are re-pointed only when the set changed —
      // synchronously, before the async build, so no file event lands in an
      // unwatched window (a write during the build schedules its own
      // debounced rebuild) and a stop() call cannot interleave a close/start
      // pair across an await boundary.
      const roots = resolveRoots()
      if (shouldWatch && !sameRootSet(roots)) {
        closeContentWatchers()
        startContentWatchers(roots)
      }
      const event = await attemptBuild("config.changed", roots, changedPath)
      if (!stopping) publish(event)
      return event
    })

  const subscribe = (
    listener: (event: ConfigGraphEvent) => void,
  ): (() => void) => {
    listeners.add(listener)
    try {
      listener(readyEvent())
    } catch (error) {
      logger.warn({ err: error }, "config-graph: subscriber threw on ready")
    }
    return () => listeners.delete(listener)
  }

  const withActiveDb = <T, E>(
    useDb: (db: KorriConfigGraphDb) => Effect.Effect<T, E>,
  ): Effect.Effect<T, E | Error> =>
    Effect.acquireUseRelease(
      Effect.try({
        try: acquireActiveGraph,
        catch: error =>
          error instanceof Error ? error : new Error(String(error)),
      }),
      graph => useDb(graph.db),
      graph => Effect.promise(() => releaseActiveGraph(graph)),
    )

  const stop = async (): Promise<void> => {
    stopping = true
    if (debounce) clearTimeout(debounce)
    debounce = undefined
    closeContentWatchers()
    signalWatcher?.close()
    signalWatcher = undefined
    await buildChain.catch(() => undefined)
    closeContentWatchers()
    signalWatcher?.close()
    signalWatcher = undefined
    listeners.clear()
    const graph = activeGraph
    activeGraph = undefined
    if (graph) await requestCloseGraph(graph)
  }

  return {
    initialize,
    rebuild,
    subscribe,
    snapshot: async () => lastGood,
    withActiveDb,
    state: readyEvent,
    stop,
  }
}
