import { createReadStream, type FSWatcher, watch } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import { StringDecoder } from "node:string_decoder"
import { sanitizeSteamEvidenceExcerpt } from "./steam-evidence-sanitizer"
import type { SteamLogSource } from "./steam-log-signals"

export interface TailedSteamLogLine {
  readonly source: SteamLogSource
  readonly logFile: string
  readonly line: string
  readonly observedAt: string
  readonly sequence: number
  readonly offset: number
}

export type SteamLogTailerState = "idle" | "running" | "degraded" | "stopped"

export interface SteamLogTailerStatus {
  readonly state: SteamLogTailerState
  readonly logDir: string
  readonly watchedFiles: readonly string[]
  readonly activeFiles: readonly string[]
  readonly missingFiles: readonly string[]
  readonly lastError?: string
}

export interface SteamLogTailerHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly scanOnce: () => Promise<void>
  readonly status: () => SteamLogTailerStatus
}

export interface CreateSteamLogTailerOptions {
  readonly logDir: string
  readonly files?: readonly string[]
  readonly onLine: (line: TailedSteamLogLine) => void
  readonly now?: () => string
  readonly intervalMs?: number
  readonly watch?: boolean
  readonly logger?: {
    readonly warn?: (input: unknown, message?: string) => void
  }
}

interface FileState {
  readonly filename: string
  inode?: number
  size?: number
  offset: number
  buffer: string
  initialized: boolean
  missing: boolean
}

export const DEFAULT_STEAM_LOG_FILES = [
  "content_log.txt",
  "gameprocess_log.txt",
  "console_log.txt",
  "shader_log.txt",
  "compat_log.txt",
  "appinfo_log.txt",
  "korri-steam-app-guest.log",
] as const

export function steamLogSourceFromFile(filename: string): SteamLogSource {
  if (filename === "content_log.txt") return "content_log"
  if (filename === "gameprocess_log.txt") return "gameprocess_log"
  if (filename === "console_log.txt") return "console_log"
  if (filename === "shader_log.txt") return "shader_log"
  if (filename === "compat_log.txt") return "compat_log"
  if (filename === "appinfo_log.txt") return "appinfo_log"
  if (filename === "korri-steam-app-guest.log") return "guest_log"
  if (/^korri-steam-launch-wrapper-.*\.log$/.test(filename))
    return "wrapper_log"
  return "auxiliary_log"
}

export function createSteamLogTailer(
  options: CreateSteamLogTailerOptions,
): SteamLogTailerHandle {
  const files = Array.from(new Set(options.files ?? DEFAULT_STEAM_LOG_FILES))
  const fileStates = new Map<string, FileState>(
    files.map(filename => [
      filename,
      { filename, offset: 0, buffer: "", initialized: false, missing: true },
    ]),
  )
  const now = options.now ?? (() => new Date().toISOString())
  let state: SteamLogTailerState = "idle"
  let lastError: string | undefined
  let watcher: FSWatcher | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let sequence = 0
  let scanInFlight: Promise<void> | undefined
  let scanAgain = false

  const setError = (error: unknown) => {
    lastError = sanitizeSteamEvidenceExcerpt(error, { maxLength: 240 })
    state = state === "stopped" ? "stopped" : "degraded"
    options.logger?.warn?.({ err: error }, "steam-log-tailer: degraded")
  }

  const handle: SteamLogTailerHandle = {
    start: async () => {
      if (state === "running") return
      state = "running"
      try {
        await noteMissingLogDir()
        for (const filename of files) await initializeFile(filename)
        const intervalMs = options.intervalMs ?? 0
        if (intervalMs > 0) {
          timer = setInterval(
            () => void handle.scanOnce().catch(setError),
            intervalMs,
          )
          if ("unref" in timer && typeof timer.unref === "function")
            timer.unref()
        }
        if (options.watch !== false) {
          watcher = watch(options.logDir, (_eventType, filename) => {
            if (!filename) return
            const name = filename.toString()
            if (
              !fileStates.has(name) &&
              /^korri-steam-launch-wrapper-.*\.log$/.test(name)
            ) {
              const wrapperCount = Array.from(fileStates.keys()).filter(key =>
                /^korri-steam-launch-wrapper-.*\.log$/.test(key),
              ).length
              if (wrapperCount >= 50) return
              fileStates.set(name, {
                filename: name,
                offset: 0,
                buffer: "",
                initialized: false,
                missing: true,
              })
            }
            if (fileStates.has(name)) {
              void handle.scanOnce().catch(setError)
            }
          })
          watcher.on("error", setError)
        }
      } catch (error) {
        setError(error)
      }
    },
    stop: async () => {
      state = "stopped"
      if (timer) clearInterval(timer)
      timer = undefined
      watcher?.close()
      watcher = undefined
    },
    scanOnce: async () => {
      if (state === "stopped") return
      if (scanInFlight) {
        scanAgain = true
        return scanInFlight
      }
      scanInFlight = scanOnceSerial()
      try {
        await scanInFlight
      } finally {
        scanInFlight = undefined
        if (scanAgain && (state as SteamLogTailerState) !== "stopped") {
          scanAgain = false
          queueMicrotask(() => void handle.scanOnce().catch(setError))
        }
      }
    },
    status: () => {
      const states = Array.from(fileStates.values())
      return omitUndefined({
        state,
        logDir: options.logDir,
        watchedFiles: Array.from(fileStates.keys()).sort(),
        activeFiles: states
          .filter(info => !info.missing)
          .map(info => info.filename)
          .sort(),
        missingFiles: states
          .filter(info => info.missing)
          .map(info => info.filename)
          .sort(),
        lastError,
      })
    },
  }

  async function scanOnceSerial(): Promise<void> {
    if (state === "stopped") return
    await noteMissingLogDir()
    for (const filename of Array.from(fileStates.keys())) {
      await scanFile(filename)
    }
    const hasActiveFile = Array.from(fileStates.values()).some(
      info => !info.missing,
    )
    if (hasActiveFile) {
      lastError = undefined
      state = "running"
    }
  }

  async function noteMissingLogDir(): Promise<void> {
    try {
      const stats = await stat(options.logDir)
      if (!stats.isDirectory())
        setError(new Error(`${options.logDir} is not a directory`))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        setError(new Error(`Steam log directory is missing: ${options.logDir}`))
        return
      }
      setError(error)
    }
  }

  async function initializeFile(filename: string): Promise<void> {
    const info = fileStates.get(filename)
    if (!info) return
    try {
      const stats = await stat(join(options.logDir, filename))
      info.inode = stats.ino
      info.size = stats.size
      info.offset = stats.size
      info.initialized = true
      info.missing = false
      info.buffer = ""
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        info.initialized = true
        info.missing = true
        info.offset = 0
        info.size = undefined
        info.inode = undefined
        return
      }
      setError(error)
    }
  }

  // fallow-ignore-next-line complexity
  async function scanFile(filename: string): Promise<void> {
    const info = fileStates.get(filename)
    if (!info) return
    const path = join(options.logDir, filename)
    let stats: Awaited<ReturnType<typeof stat>>
    try {
      stats = await stat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        info.missing = true
        return
      }
      setError(error)
      return
    }
    const inodeChanged = info.inode !== undefined && info.inode !== stats.ino
    const truncated = info.size !== undefined && stats.size < info.offset
    const firstAppearance = info.missing || !info.initialized
    if (inodeChanged || truncated || firstAppearance) {
      info.offset = firstAppearance && !info.initialized ? stats.size : 0
      if (firstAppearance && info.initialized) info.offset = 0
      info.buffer = ""
    }
    info.inode = stats.ino
    info.size = stats.size
    info.initialized = true
    info.missing = false
    if (stats.size <= info.offset) return
    await readAppend(path, info, stats.size)
    info.size = stats.size
  }

  async function readAppend(
    path: string,
    info: FileState,
    end: number,
  ): Promise<void> {
    const start = info.offset
    const stream = createReadStream(path, { start, end: end - 1 })
    const decoder = new StringDecoder("utf8")
    let text = info.buffer
    for await (const chunk of stream) text += decoder.write(chunk as Buffer)
    text += decoder.end()
    info.offset = end
    const parts = text.split(/\n/)
    info.buffer = parts.pop() ?? ""
    for (const part of parts) {
      const line = part.endsWith("\r") ? part.slice(0, -1) : part
      sequence += 1
      options.onLine({
        source: steamLogSourceFromFile(info.filename),
        logFile: info.filename,
        line,
        observedAt: now(),
        sequence,
        offset: start,
      })
    }
  }

  return handle
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}
