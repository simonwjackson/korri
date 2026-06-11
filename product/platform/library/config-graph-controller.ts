import { type Dirent, type FSWatcher, watch } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { logger } from "@platform/logger"
import { Effect } from "effect"
import type { KorriConfigGraphRoot } from "./proseql/library-db"
import { openKorriConfigGraph } from "./proseql/library-db"
import { createLibraryRepository } from "./proseql/library-repository"
import type { PlayableLibraryEntry } from "./playable-library"

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
 */
export interface ConfigGraphEvent {
  readonly name: ConfigGraphEventName
  readonly generation: number
  readonly attempt: number
  readonly status: ConfigGraphStatus
  readonly files?: readonly string[]
  readonly message?: string
  readonly changedPath?: string
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
  /** Current lifecycle state as a `config.ready` event. */
  readonly state: () => ConfigGraphEvent
  /** Stop watchers and release resources. */
  readonly stop: () => Promise<void>
}

export interface ConfigGraphControllerOptions {
  /** Static roots, frozen for the controller's lifetime. */
  readonly roots?: readonly KorriConfigGraphRoot[]
  /**
   * Dynamic root resolution, called at every (re)build so roots added or
   * removed at runtime (removable media) join or leave the graph. Exactly one
   * of `roots` / `resolveRoots` must be provided.
   */
  readonly resolveRoots?: () => readonly KorriConfigGraphRoot[]
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

function loadSnapshot(
  roots: readonly KorriConfigGraphRoot[],
): Promise<readonly PlayableLibraryEntry[]> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriConfigGraph({ roots })
        return yield* createLibraryRepository(db).listPlayableEntries()
      }),
    ),
  )
}

export function createConfigGraphController(
  options: ConfigGraphControllerOptions,
): ConfigGraphController {
  const staticRoots = options.roots
  const resolveRoots = options.resolveRoots ?? (() => staticRoots ?? [])
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const shouldWatch = options.watch ?? true

  let generation = 0
  let attempt = 0
  let status: ConfigGraphStatus = "valid"
  let files: readonly string[] = []
  let message: string | undefined
  let lastGood: readonly PlayableLibraryEntry[] = []

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

  const attemptBuild = async (
    name: ConfigGraphEventName,
    roots: readonly KorriConfigGraphRoot[],
    changedPath?: string,
  ): Promise<ConfigGraphEvent> => {
    attempt += 1
    try {
      const [snapshot, discovered] = await Promise.all([
        loadSnapshot(roots),
        discoverFragments(roots),
      ])
      lastGood = snapshot
      files = discovered
      message = undefined
      generation += 1
      status = "valid"
      const event: ConfigGraphEvent = {
        name,
        generation,
        attempt,
        status,
        files,
        ...(changedPath !== undefined ? { changedPath } : {}),
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

  const initialize = async (): Promise<ConfigGraphEvent> => {
    const roots = resolveRoots()
    const event = await attemptBuild("config.ready", roots)
    if (shouldWatch) {
      startContentWatchers(roots)
      startSignalWatcher()
    }
    return event
  }

  const rebuild = async (changedPath?: string): Promise<ConfigGraphEvent> => {
    // Coarse re-resolve: every rebuild re-reads the root set so dynamically
    // mounted roots join (or leave) the graph regardless of which watcher
    // fired. Content watchers are re-pointed only when the set changed.
    const roots = resolveRoots()
    const repoint = shouldWatch && !sameRootSet(roots)
    if (repoint) closeContentWatchers()
    const event = await attemptBuild("config.changed", roots, changedPath)
    if (repoint) startContentWatchers(roots)
    publish(event)
    return event
  }

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

  const stop = async (): Promise<void> => {
    if (debounce) clearTimeout(debounce)
    debounce = undefined
    closeContentWatchers()
    signalWatcher?.close()
    signalWatcher = undefined
    listeners.clear()
  }

  return {
    initialize,
    rebuild,
    subscribe,
    snapshot: async () => lastGood,
    state: readyEvent,
    stop,
  }
}
