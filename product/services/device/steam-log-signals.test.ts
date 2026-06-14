import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  parseSteamLogLine,
  parseSteamLogText,
  type SteamLogSource,
} from "./steam-log-signals"

const fixtureRoot = join(
  process.cwd(),
  "docs/research/steam-observability/bandai-2026-06-14/parser-fixtures",
)

const readFixture = (name: string) =>
  readFileSync(join(fixtureRoot, name), "utf8")

const sourceOf = (file: string): SteamLogSource => {
  if (file.startsWith("content-log")) return "content_log"
  if (file.startsWith("gameprocess-log")) return "gameprocess_log"
  if (file.startsWith("console-log")) return "console_log"
  if (file.startsWith("shader-log")) return "shader_log"
  return "auxiliary_log"
}

describe("Steam log signal parsing", () => {
  it("parses content-log App Running and stopped state", () => {
    const running = parseSteamLogLine({
      source: "content_log",
      logFile: "content_log.txt",
      line: "[2026-06-14 14:39:02] AppID 584400 state changed : Fully Installed,App Running,",
      observedAt: "2026-06-14T18:39:02.000Z",
      sequence: 1,
    })
    const stopped = parseSteamLogLine({
      source: "content_log",
      logFile: "content_log.txt",
      line: "[2026-06-14 14:39:35] AppID 584400 state changed : Fully Installed,",
      observedAt: "2026-06-14T18:39:35.000Z",
      sequence: 2,
    })

    expect(running).toMatchObject({
      _tag: "SteamAppStateChanged",
      appId: "584400",
      running: true,
      appState: "Fully Installed,App Running,",
    })
    expect(stopped).toMatchObject({
      _tag: "SteamAppStateChanged",
      appId: "584400",
      running: false,
      appState: "Fully Installed,",
    })
  })

  it("parses gameprocess tracked PID adds and removals", () => {
    const addedWithCommand = parseSteamLogLine({
      source: "gameprocess_log",
      logFile: "gameprocess_log.txt",
      line: '[2026-06-14 14:39:02] AppID 584400 adding PID 196491 as a tracked process "<korri-bin>/korri-steam-gamescope-launch --appid 584400"',
      observedAt: "2026-06-14T18:39:02.000Z",
      sequence: 1,
    })
    const addedWithoutCommand = parseSteamLogLine({
      source: "gameprocess_log",
      logFile: "gameprocess_log.txt",
      line: "[2026-06-14 14:39:03] AppID 584400 adding PID 196550 as a tracked process",
      observedAt: "2026-06-14T18:39:03.000Z",
      sequence: 2,
    })
    const removed = parseSteamLogLine({
      source: "gameprocess_log",
      logFile: "gameprocess_log.txt",
      line: "[2026-06-14 14:39:35] AppID 584400 no longer tracking PID 196491, exit code 0",
      observedAt: "2026-06-14T18:39:35.000Z",
      sequence: 3,
    })

    expect(addedWithCommand).toMatchObject({
      _tag: "TrackedPidAdded",
      appId: "584400",
      pid: 196491,
      commandExcerpt: expect.stringContaining("--appid 584400"),
    })
    expect(addedWithoutCommand).toMatchObject({
      _tag: "TrackedPidAdded",
      appId: "584400",
      pid: 196550,
    })
    expect(addedWithoutCommand).not.toHaveProperty("commandExcerpt")
    expect(removed).toMatchObject({
      _tag: "TrackedPidRemoved",
      appId: "584400",
      pid: 196491,
      exitCode: 0,
    })
  })

  it("parses launch tasks, install-script progress, prompts, and console process evidence", () => {
    const text = `${readFixture("console-log-caveblazers-452060.txt")}\n${readFixture("console-log-sonic-mania-584400.txt")}`
    const signals = parseSteamLogText({
      source: "console_log",
      logFile: "console_log.txt",
      text,
      observedAt: "2026-06-14T18:40:40.000Z",
      startingSequence: 1,
    })

    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "LaunchTaskChanged",
        appId: "452060",
        actionId: "3",
        task: "RunningInstallScript",
        projection: "Preparing",
      }),
    )
    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "LaunchTaskChanged",
        appId: "452060",
        task: "SynchronizingCloud",
        projection: "Preparing",
      }),
    )
    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "InstallScriptProgress",
        appId: "584400",
      }),
    )
    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "LaunchUserPrompt",
        prompt: "waiting",
        task: "CreatingProcess",
      }),
    )
    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "ConsoleProcessEvidence",
        action: "added",
        appId: "452060",
        procId: 200093,
      }),
    )
  })

  it("parses shader AppID evidence without making it lifecycle authority", () => {
    const signals = parseSteamLogText({
      source: "shader_log",
      logFile: "shader_log.txt",
      text: readFixture("shader-log-appid-evidence.txt"),
      observedAt: "2026-06-14T18:42:00.000Z",
      startingSequence: 1,
    })

    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "ShaderEvidence",
        appId: "584400",
        evidenceKind: "cache-dir",
      }),
    )
    expect(signals).toContainEqual(
      expect.objectContaining({
        _tag: "ShaderEvidence",
        appId: "584400",
        evidenceKind: "app-exited",
      }),
    )
  })

  it("keeps unknown, noisy, and malformed lines observable without throwing", () => {
    for (const line of [
      "[2026-06-14 14:39:02] /bin/sh\\0-c\\0<korri-bin>/korri-steam-gamescope-launch\\0",
      "[2026-06-14 14:39:02] SSGL: noisy line",
      "thread priority warning",
      "[broken timestamp] AppID nope",
    ]) {
      expect(() =>
        parseSteamLogLine({
          source: "console_log",
          logFile: "console_log.txt",
          line,
          observedAt: "2026-06-14T18:39:02.000Z",
          sequence: 1,
        }),
      ).not.toThrow()
    }
  })

  it("parses every source-specific Bandai fixture without leaking unsanitized sensitive paths", () => {
    const fixtureNames = [
      "content-log-downwell-360740.txt",
      "content-log-sonic-mania-584400.txt",
      "content-log-caveblazers-452060.txt",
      "gameprocess-log-downwell-360740.txt",
      "gameprocess-log-sonic-mania-584400.txt",
      "gameprocess-log-caveblazers-452060.txt",
      "console-log-downwell-360740.txt",
      "console-log-sonic-mania-584400.txt",
      "console-log-caveblazers-452060.txt",
      "shader-log-appid-evidence.txt",
    ]

    for (const name of fixtureNames) {
      const text = readFixture(name)
      expect(text).not.toContain("/home/")
      expect(text).not.toMatch(/userdata\/\d+/)
      const signals = parseSteamLogText({
        source: sourceOf(name),
        logFile: name,
        text,
        observedAt: "2026-06-14T18:42:00.000Z",
        startingSequence: 1,
      })
      expect(signals.length).toBeGreaterThan(0)
    }
  })
})
