/**
 * Live wiring for the Sunshine stream watcher on the source machine.
 *
 * Tails the Sunshine log file (user-scope path, e.g.
 * ~/.config/sunshine/sunshine.log) as an async line stream, and implements
 * freeze/thaw against the local sessiond managed-launch endpoints. Sunshine is
 * a systemd *user* service; the log path arrives via KORRI_SUNSHINE_LOG_PATH
 * from the NixOS module. Thin adapter: the signal/debounce/reopen behavior
 * lives in sunshine-stream-watcher.ts and is unit-tested there.
 */
import { open, stat } from "node:fs/promises"
import {
  freezeSessiondManagedLaunch,
  probeSessiondManagedLaunchStatus,
  type SessiondManagedLaunchClientOptions,
  thawSessiondManagedLaunch,
} from "@platform/library/sessiond-managed-launch-client"
import {
  createSunshineStreamWatcher,
  type SunshineStreamWatcher,
  type SunshineStreamWatcherLogger,
} from "./sunshine-stream-watcher"

const TAIL_POLL_INTERVAL_MS = 500

export function startSunshineStreamWatcherFromEnv(deps: {
  readonly env: Record<string, string | undefined>
  readonly logger: SunshineStreamWatcherLogger
  readonly sessiond?: SessiondManagedLaunchClientOptions
}): SunshineStreamWatcher | null {
  const logPath = deps.env.KORRI_SUNSHINE_LOG_PATH?.trim()
  if (!logPath) return null
  const sessiond = deps.sessiond ?? { env: process.env }
  const debounceMs = Number.parseInt(
    deps.env.KORRI_SUNSHINE_WATCHER_DEBOUNCE_MS ?? "",
    10,
  )

  const watcher = createSunshineStreamWatcher({
    openLogStream: () => openLogTail(logPath),
    freezeActiveLaunch: async () => {
      const status = await probeSessiondManagedLaunchStatus(sessiond)
      if (status.kind !== "ok") return
      const launchId = status.status.active?.launchId
      if (!launchId) return
      if (status.status.capabilities.launchFreeze !== true) return
      await freezeSessiondManagedLaunch({ launchId }, sessiond)
    },
    thawActiveLaunch: async () => {
      const status = await probeSessiondManagedLaunchStatus(sessiond)
      if (status.kind !== "ok") return
      const active = status.status.active
      if (!active || active.phase !== "frozen") return
      await thawSessiondManagedLaunch({ launchId: active.launchId }, sessiond)
    },
    logger: deps.logger,
    ...(Number.isFinite(debounceMs) ? { debounceMs } : {}),
  })
  watcher.start()
  deps.logger.info(
    { logPath },
    "sunshine-stream-watcher: watching for client disconnects",
  )
  return watcher
}

/**
 * Follow a log file from its current end, yielding complete lines as they are
 * appended. Throws on truncation (rotation) or read errors so the watcher's
 * bounded reopen loop re-attaches to the fresh file.
 */
async function* openLogTailLines(path: string): AsyncGenerator<string> {
  const handle = await open(path, "r")
  try {
    let offset = (await handle.stat()).size
    let carry = ""
    const chunk = new Uint8Array(64 * 1024)
    const decoder = new TextDecoder()
    while (true) {
      const current = await stat(path)
      if (current.size < offset) {
        throw new Error("sunshine log truncated (rotation)")
      }
      if (current.size > offset) {
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset)
        if (bytesRead > 0) {
          offset += bytesRead
          carry += decoder.decode(chunk.subarray(0, bytesRead), {
            stream: true,
          })
          let newline = carry.indexOf("\n")
          while (newline >= 0) {
            yield carry.slice(0, newline)
            carry = carry.slice(newline + 1)
            newline = carry.indexOf("\n")
          }
          continue
        }
      }
      await sleep(TAIL_POLL_INTERVAL_MS)
    }
  } finally {
    await handle.close()
  }
}

async function openLogTail(path: string): Promise<AsyncIterable<string>> {
  // Open eagerly so missing files reject here and route into the watcher's
  // reopen budget rather than surfacing as an unhandled stream error.
  await stat(path)
  return openLogTailLines(path)
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms)
    if ("unref" in timer && typeof timer.unref === "function") timer.unref()
  })
}
