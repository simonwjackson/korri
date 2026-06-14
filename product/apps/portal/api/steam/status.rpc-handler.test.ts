import { afterEach, describe, expect, it } from "bun:test"
import {
  installSteamLogObserverStatus,
  resetSteamLogObserverStatusForTests,
} from "@product/services/device/steam-log-observer"
import { Effect } from "effect"
import { handleSteamStatus } from "./status.rpc-handler"

afterEach(() => {
  resetSteamLogObserverStatusForTests()
})

describe("app.steam.status handler", () => {
  it("returns unavailable health when no observer is installed", async () => {
    const result = await Effect.runPromise(handleSteamStatus({}))

    expect(result).toMatchObject({
      observer: { state: "unavailable" },
    })
    expect(result.active).toBeUndefined()
    expect(result.latest).toBeUndefined()
  })

  it("returns an active running snapshot with bounded evidence", async () => {
    const owner = Symbol("steam-status-test")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "running",
        logDir: "/var/lib/korri/steam/logs",
        watchedFiles: ["content_log.txt"],
        activeFiles: ["content_log.txt"],
        missingFiles: [],
      },
      active: {
        appId: "584400",
        status: { _tag: "Running" },
        confidence: "confirmed",
        ownership: "steam-only",
        firstObservedAt: "2026-06-14T14:38:41.000Z",
        lastObservedAt: "2026-06-14T14:39:02.000Z",
        lastProgressAt: "2026-06-14T14:39:02.000Z",
        steam: {
          appState: "Fully Installed,App Running,",
          running: true,
          actionId: "2",
          lastTask: "Completed",
          taskHistory: ["ProcessingInstallScript", "Completed"],
          trackedPids: [196491],
          removedPids: [],
        },
        evidence: Array.from({ length: 80 }, (_, index) => ({
          source: "content_log" as const,
          logFile: "content_log.txt",
          observedAt: "2026-06-14T14:39:02.000Z",
          sequence: index + 1,
          confidence: "confirmed" as const,
          parser: "steam-log-signals@1",
          excerpt: `line ${index}`,
        })),
      },
      recentEvidence: [],
    }))

    const result = await Effect.runPromise(handleSteamStatus({}))

    expect(result.active).toMatchObject({
      appId: "584400",
      status: "Running",
      confidence: "confirmed",
      steam: {
        appState: "Fully Installed,App Running,",
        actionId: "2",
        lastTask: "Completed",
        trackedPids: [196491],
      },
    })
    expect(result.active?.evidence.length).toBeLessThanOrEqual(50)
  })

  it("keeps latest stopped snapshot after active clears", async () => {
    const owner = Symbol("steam-status-latest")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "running",
        logDir: "/var/lib/korri/steam/logs",
        watchedFiles: ["content_log.txt"],
        activeFiles: ["content_log.txt"],
        missingFiles: [],
      },
      latest: {
        appId: "584400",
        status: { _tag: "Stopped" },
        confidence: "confirmed",
        ownership: "steam-only",
        firstObservedAt: "2026-06-14T14:38:41.000Z",
        lastObservedAt: "2026-06-14T14:39:35.000Z",
        lastProgressAt: "2026-06-14T14:39:35.000Z",
        steam: {
          running: false,
          trackedPids: [],
          removedPids: [{ pid: 196491, exitCode: 0 }],
          taskHistory: [],
        },
        evidence: [],
      },
      recentEvidence: [],
    }))

    const result = await Effect.runPromise(handleSteamStatus({}))

    expect(result.active).toBeUndefined()
    expect(result.latest).toMatchObject({ appId: "584400", status: "Stopped" })
  })

  it("sanitizes and clamps health errors and evidence", async () => {
    const owner = Symbol("steam-status-sanitize")
    installSteamLogObserverStatus(owner, () => ({
      health: {
        state: "degraded",
        logDir: "/home/korri/.steam/logs",
        watchedFiles: ["content_log.txt"],
        activeFiles: [],
        missingFiles: ["content_log.txt"],
        lastError:
          "failed /home/korri/.steam/logs file:///tmp/a?token=secret userdata/80924811 SECRET_KEY=abc " +
          "x".repeat(500),
      },
      recentEvidence: [
        {
          source: "console_log",
          logFile: "console_log.txt",
          observedAt: "2026-06-14T14:39:02.000Z",
          sequence: 1,
          confidence: "unknown",
          parser: "steam-log-signals@1",
          excerpt:
            "launch /home/korri/game file:///tmp/a?token=secret userdata/80924811 SECRET_KEY=abc",
        },
      ],
    }))

    const result = await Effect.runPromise(handleSteamStatus({}))

    expect(result.observer.lastError).toContain("/home/<redacted>")
    expect(result.observer.lastError).not.toContain("secret")
    expect(result.recentEvidence[0].excerpt).toContain(
      "userdata/<steam-user-id>",
    )
    expect(result.recentEvidence[0].excerpt).not.toContain("80924811")
  })
})
