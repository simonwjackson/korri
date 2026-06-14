import { afterEach, describe, expect, it } from "bun:test"
import {
  createSteamLogObserver,
  getInstalledSteamLogObserverStatus,
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
  type SteamObserverTailer,
} from "./steam-log-observer"
import type { TailedSteamLogLine } from "./steam-log-tailer"

class ControllableTailer implements SteamObserverTailer {
  onLine?: (line: TailedSteamLogLine) => void
  started = 0
  stopped = 0
  async start() {
    this.started += 1
  }
  async stop() {
    this.stopped += 1
  }
  status() {
    return {
      state: "running" as const,
      logDir: "/tmp/steam/logs",
      watchedFiles: ["console_log.txt"],
      activeFiles: ["console_log.txt"],
      missingFiles: [],
    }
  }
  emit(line: TailedSteamLogLine) {
    this.onLine?.(line)
  }
}

afterEach(() => {
  resetSteamLogObserverStatusForTests()
})

describe("Steam log observer", () => {
  it("consumes tailed lines and updates active/latest snapshots", async () => {
    const tailer = new ControllableTailer()
    const observer = createSteamLogObserver({
      logDir: "/tmp/steam/logs",
      createTailer: options => {
        tailer.onLine = options.onLine
        return tailer
      },
      now: () => "2026-06-14T14:39:03.000Z",
    })

    await observer.start()
    tailer.emit({
      source: "console_log",
      logFile: "console_log.txt",
      line: '[2026-06-14 14:38:41] GameAction [AppID 584400, ActionID 2] : LaunchApp changed task to ProcessingInstallScript with ""',
      observedAt: "2026-06-14T18:38:41.000Z",
      sequence: 1,
      offset: 0,
    })
    tailer.emit({
      source: "content_log",
      logFile: "content_log.txt",
      line: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,",
      observedAt: "2026-06-14T18:39:02.000Z",
      sequence: 2,
      offset: 1,
    })

    expect(observer.status().active).toMatchObject({
      appId: "584400",
      status: { _tag: "Running" },
    })
    await observer.stop()
    expect(tailer.stopped).toBe(1)
  })

  it("records startup failures without throwing", async () => {
    const observer = createSteamLogObserver({
      logDir: "/missing",
      createTailer: () => ({
        start: async () => {
          throw new Error("ENOENT /missing")
        },
        stop: async () => {},
        status: () => ({
          state: "degraded",
          logDir: "/missing",
          watchedFiles: [],
          activeFiles: [],
          missingFiles: [],
        }),
      }),
    })

    await expect(observer.start()).resolves.toBeUndefined()
    expect(observer.status().health).toMatchObject({ state: "degraded" })
    expect(observer.status().health.lastError).toContain("ENOENT")
  })

  it("uses owner tokens so lifecycles cannot uninstall each other's seam", () => {
    const ownerA = Symbol("a")
    const ownerB = Symbol("b")
    const status = {
      health: {
        state: "running" as const,
        logDir: "/tmp/steam/logs",
        watchedFiles: [],
        activeFiles: [],
        missingFiles: [],
      },
      recentEvidence: [],
    }

    const installA = installSteamLogObserverStatus(ownerA, () => status)
    const installB = installSteamLogObserverStatus(ownerB, () => ({
      ...status,
      health: { ...status.health, state: "stopped" as const },
    }))

    expect(getInstalledSteamLogObserverStatus().health.state).toBe("stopped")
    installA.uninstall()
    expect(getInstalledSteamLogObserverStatus().health.state).toBe("stopped")
    installB.uninstall()
    expect(getInstalledSteamLogObserverStatus().health.state).toBe(
      "unavailable",
    )
  })
})
