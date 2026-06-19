import { afterEach, describe, expect, it } from "bun:test"
import {
  createSteamLogObserver,
  getInstalledSteamLogObserverStatus,
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
  type SteamObserverTailer,
} from "./log-observer"
import type { TailedSteamLogLine } from "./log-tailer"

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

  it("correlates lifecycle events with Korri launch identity", () => {
    const observer = createSteamLogObserver({
      logDir: "/tmp/steam/logs",
      now: () => "2026-06-14T18:39:03.000Z",
    })

    observer.openCorrelation({
      appId: "1029210",
      launchId: "launch-30xx",
      playableId: "thirty-xx",
    })
    observer.ingestLine({
      source: "console_log",
      logFile: "console_log.txt",
      line: '[2026-06-14 14:38:41] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to WaitingGameWindow with ""',
      observedAt: "2026-06-14T18:38:41.000Z",
      sequence: 1,
    })

    const lifecycle = observer.collectLifecycle({ launchId: "launch-30xx" })
    expect(lifecycle.summary).toMatchObject({
      appId: "1029210",
      launchId: "launch-30xx",
      playableId: "thirty-xx",
      providerPhase: "waiting-window",
    })
    expect(lifecycle.events).toHaveLength(1)
    expect(lifecycle.events[0]).toMatchObject({
      launchId: "launch-30xx",
      playableId: "thirty-xx",
      phase: "waiting-window",
    })
  })

  it("attaches launch correlation to context-only shader evidence", () => {
    const observer = createSteamLogObserver({
      logDir: "/tmp/steam/logs",
      now: () => "2026-06-14T18:39:03.000Z",
    })

    observer.openCorrelation({
      appId: "1029210",
      launchId: "launch-30xx",
      playableId: "thirty-xx",
    })
    observer.ingestLine({
      source: "shader_log",
      logFile: "shader_log.txt",
      line: "[2026-06-14 14:38:40] Setting MESA_GLSL_CACHE_DIR=/home/korri/.steam/steamapps/shadercache/1029210 MESA_DISK_CACHE_READ_ONLY_FOZ_DBS=steam_cache",
      observedAt: "2026-06-14T18:38:40.000Z",
      sequence: 1,
    })

    const lifecycle = observer.collectLifecycle({ launchId: "launch-30xx" })
    expect(lifecycle.summary).toMatchObject({
      appId: "1029210",
      launchId: "launch-30xx",
      providerPhase: "shader-preparing",
    })
    expect(lifecycle.events).toHaveLength(1)
    expect(lifecycle.events[0]).toMatchObject({
      launchId: "launch-30xx",
      playableId: "thirty-xx",
      phase: "shader-preparing",
    })
  })

  it("bounds lifecycle replay and honors cursors", () => {
    const observer = createSteamLogObserver({
      logDir: "/tmp/steam/logs",
      now: () => "2026-06-14T18:39:03.000Z",
    })
    observer.openCorrelation({ appId: "1029210", launchId: "launch-30xx" })

    for (let index = 0; index < 205; index += 1) {
      observer.ingestLine({
        source: "console_log",
        logFile: "console_log.txt",
        line: `[2026-06-14 14:38:${String(index % 60).padStart(2, "0")}] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to ProcessingInstallScript with "${index}"`,
        observedAt: "2026-06-14T18:38:41.000Z",
        sequence: index + 1,
      })
    }

    const bounded = observer.collectLifecycle({
      launchId: "launch-30xx",
      limit: 200,
    })
    expect(bounded.events).toHaveLength(200)
    expect(bounded.events[0]?.sequence).toBe(6)

    const window = observer.collectLifecycle({
      appId: "1029210",
      launchId: "launch-30xx",
      sinceSequence: 200,
      limit: 10,
    })
    expect(window.events.map(event => event.sequence)).toEqual([
      201, 202, 203, 204, 205,
    ])
  })

  it("does not publish stopped latest snapshots as compact active summaries", () => {
    const observer = createSteamLogObserver({
      logDir: "/tmp/steam/logs",
      now: () => "2026-06-14T18:39:40.000Z",
    })
    observer.ingestLine({
      source: "content_log",
      logFile: "content_log.txt",
      line: "[2026-06-14 14:39:02] AppID 1029210 state changed : Fully Installed,App Running,",
      observedAt: "2026-06-14T18:39:02.000Z",
      sequence: 1,
    })
    observer.ingestLine({
      source: "content_log",
      logFile: "content_log.txt",
      line: "[2026-06-14 14:39:35] AppID 1029210 state changed : Fully Installed,",
      observedAt: "2026-06-14T18:39:35.000Z",
      sequence: 2,
    })

    expect(observer.status().latest).toMatchObject({
      appId: "1029210",
      status: { _tag: "Stopped" },
    })
    expect(observer.status().active).toBeUndefined()
    expect(observer.status().lifecycleSummary).toBeUndefined()
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
