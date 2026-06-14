import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  initialSteamLaunchObserverState,
  projectSteamLaunchSnapshot,
  reduceSteamLogSignals,
  sortSteamLogSignalsForReplay,
} from "./steam-launch-state"
import { parseSteamLogText } from "./steam-log-signals"

const fixtureRoot = join(
  process.cwd(),
  "docs/research/steam-observability/bandai-2026-06-14/parser-fixtures",
)

function read(name: string) {
  return readFileSync(join(fixtureRoot, name), "utf8")
}

function replay(names: readonly string[]) {
  const signals = names.flatMap((name, index) => {
    const source = name.startsWith("content")
      ? "content_log"
      : name.startsWith("gameprocess")
        ? "gameprocess_log"
        : name.startsWith("console")
          ? "console_log"
          : "shader_log"
    return parseSteamLogText({
      source,
      logFile: name,
      text: read(name),
      observedAt: "2026-06-14T18:42:00.000Z",
      startingSequence: index * 1000 + 1,
    })
  })
  return reduceSteamLogSignals(
    initialSteamLaunchObserverState,
    sortSteamLogSignalsForReplay(signals),
  )
}

describe("Steam launch state reducer", () => {
  it("replays Sonic Mania through Preparing, Launching, Running, and Stopped", () => {
    const state = replay([
      "console-log-sonic-mania-584400.txt",
      "gameprocess-log-sonic-mania-584400.txt",
      "content-log-sonic-mania-584400.txt",
      "shader-log-appid-evidence.txt",
    ])

    expect(state.latest?.appId).toBe("584400")
    expect(state.latest?.status).toEqual({ _tag: "Stopped" })
    expect(state.active).toBeUndefined()
    expect(state.latest?.steam.appState).toBe("Fully Installed,")
    expect(state.latest?.steam.lastTask).toBe("Completed")
    expect(state.latest?.steam.removedPids).toContainEqual(
      expect.objectContaining({ pid: 196491, exitCode: 0 }),
    )
    expect(state.latest?.evidence.length).toBeGreaterThan(0)
  })

  it("treats Caveblazers install-script and cloud tasks as Preparing before Running", () => {
    const state = replay([
      "console-log-caveblazers-452060.txt",
      "gameprocess-log-caveblazers-452060.txt",
      "content-log-caveblazers-452060.txt",
    ])

    expect(state.latest?.appId).toBe("452060")
    expect(state.latest?.status).toEqual({ _tag: "Stopped" })
    expect(state.latest?.steam.taskHistory).toEqual(
      expect.arrayContaining(["RunningInstallScript", "SynchronizingCloud"]),
    )
  })

  it("ignores stale Downwell pre-launch removals before tracking the fresh launch", () => {
    const state = replay([
      "gameprocess-log-downwell-360740.txt",
      "console-log-downwell-360740.txt",
      "content-log-downwell-360740.txt",
      "shader-log-appid-evidence.txt",
    ])

    expect(state.latest?.appId).toBe("360740")
    expect(state.latest?.status).toEqual({ _tag: "Stopped" })
    expect(state.latest?.steam.removedPids).toContainEqual(
      expect.objectContaining({ pid: 204611, exitCode: 0 }),
    )
    expect(state.latest?.steam.removedPids).not.toContainEqual(
      expect.objectContaining({ pid: 114424 }),
    )
  })

  it("reduces same-timestamp App Running and PID add deterministically", () => {
    const content = parseSteamLogText({
      source: "content_log",
      logFile: "content_log.txt",
      text: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,\n",
      observedAt: "2026-06-14T18:39:02.000Z",
      startingSequence: 20,
    })
    const pid = parseSteamLogText({
      source: "gameprocess_log",
      logFile: "gameprocess_log.txt",
      text: "[2026-06-14 14:39:02] AppID 584400 adding PID 196491 as a tracked process\n",
      observedAt: "2026-06-14T18:39:02.000Z",
      startingSequence: 10,
    })
    const a = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      sortSteamLogSignalsForReplay([...content, ...pid]),
    )
    const b = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      sortSteamLogSignalsForReplay([...pid, ...content]),
    )

    expect(a.active).toEqual(b.active)
    expect(a.active?.status).toEqual({ _tag: "Running" })
    expect(a.active?.steam.trackedPids).toContain(196491)
  })

  it("does not let shader evidence downgrade confirmed Running", () => {
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      sortSteamLogSignalsForReplay([
        ...parseSteamLogText({
          source: "content_log",
          logFile: "content_log.txt",
          text: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,\n",
          observedAt: "2026-06-14T18:39:02.000Z",
          startingSequence: 1,
        }),
        ...parseSteamLogText({
          source: "shader_log",
          logFile: "shader_log.txt",
          text: "[2026-06-14 14:39:02] Setting MESA_GLSL_CACHE_DIR=<steam-home>/steamapps/shadercache/584400 MESA_DISK_CACHE_READ_ONLY_FOZ_DBS=steam_cache,steam_precompiled\n",
          observedAt: "2026-06-14T18:39:02.000Z",
          startingSequence: 2,
        }),
      ]),
    )

    expect(state.active?.status).toEqual({ _tag: "Running" })
  })

  it("keeps an active launch when an unrelated AppID emits stopped evidence", () => {
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      sortSteamLogSignalsForReplay([
        ...parseSteamLogText({
          source: "content_log",
          logFile: "content_log.txt",
          text: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,\n",
          observedAt: "2026-06-14T18:39:02.000Z",
          startingSequence: 1,
        }),
        ...parseSteamLogText({
          source: "content_log",
          logFile: "content_log.txt",
          text: "[2026-06-14 14:39:03] AppID 452060 state changed : Fully Installed,\n",
          observedAt: "2026-06-14T18:39:03.000Z",
          startingSequence: 2,
        }),
      ]),
    )

    expect(state.active).toMatchObject({
      appId: "584400",
      status: { _tag: "Running" },
    })
    expect(state.latest).toMatchObject({
      appId: "452060",
      status: { _tag: "Stopped" },
      confidence: "low",
    })
  })

  it("uses observed ISO timestamps for snapshot fields while retaining Steam timestamps as evidence", () => {
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      parseSteamLogText({
        source: "content_log",
        logFile: "content_log.txt",
        text: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,\n",
        observedAt: "2026-06-14T18:39:02.000Z",
        startingSequence: 1,
      }),
    )

    expect(state.active?.lastObservedAt).toBe("2026-06-14T18:39:02.000Z")
    expect(state.active?.evidence[0]?.steamTimestamp).toBe(
      "2026-06-14 14:39:02",
    )
  })

  it("records cold stopped evidence without proving a full observed lifecycle", () => {
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      parseSteamLogText({
        source: "content_log",
        logFile: "content_log.txt",
        text: "[2026-06-14 14:39:35] AppID 584400 state changed : Fully Installed,\n",
        observedAt: "2026-06-14T18:39:35.000Z",
        startingSequence: 1,
      }),
    )

    expect(state.active).toBeUndefined()
    expect(state.latest?.status).toEqual({ _tag: "Stopped" })
    expect(state.latest?.confidence).toBe("low")
    expect(state.latest?.ownership).toBe("steam-only")
  })

  it("projects Stuck from explicit time without mutating reducer state", () => {
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      parseSteamLogText({
        source: "console_log",
        logFile: "console_log.txt",
        text: '[2026-06-14 14:38:41] GameAction [AppID 584400, ActionID 2] : LaunchApp changed task to ProcessingInstallScript with ""\n',
        observedAt: "2026-06-14T18:38:41.000Z",
        startingSequence: 1,
      }),
    )

    const projected = projectSteamLaunchSnapshot(state.active, {
      now: "2026-06-14T18:40:00.000Z",
      stuckThresholdMs: 60_000,
    })

    expect(projected?.status).toEqual({ _tag: "Stuck" })
    expect(state.active?.status).toEqual({ _tag: "Preparing" })
  })

  it("bounds raw evidence", () => {
    const rawSignals = Array.from({ length: 80 }, (_, index) =>
      parseSteamLogText({
        source: "console_log",
        logFile: "console_log.txt",
        text: `[2026-06-14 14:38:41] unknown line ${index}\n`,
        observedAt: "2026-06-14T18:38:41.000Z",
        startingSequence: index + 1,
      }),
    ).flat()
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      rawSignals,
      {
        evidenceLimit: 20,
      },
    )

    expect(state.recentEvidence.length).toBeLessThanOrEqual(20)
  })
})
