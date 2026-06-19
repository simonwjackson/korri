import { describe, expect, it } from "bun:test"
import {
  initialSteamLaunchObserverState,
  reduceSteamLogSignals,
} from "./launch-state"
import {
  createSteamLifecycleEvent,
  summaryFromSteamSnapshot,
} from "./lifecycle-events"
import { parseSteamLogText } from "./log-signals"

function firstSignal(text: string) {
  return parseSteamLogText({
    source: "console_log",
    logFile: "console_log.txt",
    text,
    observedAt: "2026-06-14T18:38:41.000Z",
  })[0]
}

describe("Steam lifecycle event projection", () => {
  it("projects Steam task signals into the V1 lifecycle vocabulary", () => {
    const signal = firstSignal(
      '[2026-06-14 14:38:41] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to CheckShaderDepotManifest with ""\n',
    )
    const state = reduceSteamLogSignals(initialSteamLaunchObserverState, [
      signal,
    ])

    const event = createSteamLifecycleEvent({
      sequence: 1,
      signal,
      snapshot: state.active,
    })

    expect(event).toMatchObject({
      providerId: "@korri:steam",
      sequence: 1,
      appId: "1029210",
      phase: "shader-preparing",
      status: "active",
      nextActionHint: "wait",
    })
    expect(event?.displayMessage).toContain("shader")
    expect(event?.evidence.excerpt).not.toContain("/home/")
  })

  it("marks prompt phases as blocked with an action hint", () => {
    const signal = firstSignal(
      '[2026-06-14 14:38:44] GameAction [AppID 1029210, ActionID 2] : LaunchApp waiting for user response to ShowInterstitials ""\n',
    )

    const event = createSteamLifecycleEvent({
      sequence: 2,
      signal,
      snapshot: undefined,
    })

    expect(event).toMatchObject({
      phase: "waiting-user-prompt",
      status: "blocked",
      severity: "warning",
      nextActionHint: "interact-with-steam",
    })
  })

  it("covers the V1 task phase vocabulary", () => {
    const cases = [
      ["SynchronizingCloud", "cloud-sync", "active", "wait"],
      ["CreatingProcess", "creating-process", "active", "wait"],
      ["WaitingGameWindow", "waiting-window", "active", "wait"],
      ["Completed", "running", "active", "none"],
    ] as const

    for (const [task, phase, status, nextActionHint] of cases) {
      const signal = firstSignal(
        `[2026-06-14 14:38:41] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to ${task} with ""\n`,
      )
      const event = createSteamLifecycleEvent({
        sequence: 1,
        signal,
        snapshot: undefined,
      })
      expect(event).toMatchObject({ phase, status, nextActionHint })
    }
  })

  it("covers running, stopping, stopped, and stuck summaries", () => {
    const running = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      parseSteamLogText({
        source: "content_log",
        logFile: "content_log.txt",
        text: "[2026-06-14 14:39:02] AppID 1029210 state changed : Fully Installed,App Running,\n",
        observedAt: "2026-06-14T18:39:02.000Z",
      }),
    )
    expect(
      summaryFromSteamSnapshot({
        observerHealth: "running",
        snapshot: running.active,
      }),
    ).toMatchObject({
      providerPhase: "running",
      lifecycleStatus: "active",
      nextActionHint: "none",
    })

    const stoppingSignal = parseSteamLogText({
      source: "gameprocess_log",
      logFile: "gameprocess_log.txt",
      text: "[2026-06-14 14:39:04] AppID 1029210 no longer tracking PID 99, exit code 0\n",
      observedAt: "2026-06-14T18:39:04.000Z",
    })[0]
    const stoppingEvent = createSteamLifecycleEvent({
      sequence: 2,
      signal: stoppingSignal,
      snapshot: running.active,
    })
    expect(stoppingEvent).toMatchObject({
      phase: "stopping",
      status: "active",
    })

    const stopped = reduceSteamLogSignals(running, [
      ...parseSteamLogText({
        source: "content_log",
        logFile: "content_log.txt",
        text: "[2026-06-14 14:39:35] AppID 1029210 state changed : Fully Installed,\n",
        observedAt: "2026-06-14T18:39:35.000Z",
      }),
    ])
    expect(
      summaryFromSteamSnapshot({
        observerHealth: "running",
        snapshot: stopped.latest,
      }),
    ).toMatchObject({
      providerPhase: "stopped",
      lifecycleStatus: "terminal",
      nextActionHint: "none",
    })

    if (!running.active) throw new Error("expected running active snapshot")
    expect(
      summaryFromSteamSnapshot({
        observerHealth: "running",
        snapshot: { ...running.active, status: { _tag: "Stuck" } },
      }),
    ).toMatchObject({
      providerPhase: "stuck",
      lifecycleStatus: "stuck",
      nextActionHint: "inspect-diagnostics",
    })
  })

  it("builds a compact provider summary from correlated snapshots", () => {
    const signal = firstSignal(
      '[2026-06-14 14:38:41] GameAction [AppID 1029210, ActionID 2] : LaunchApp changed task to ProcessingInstallScript with ""\n',
    )
    const state = reduceSteamLogSignals(
      initialSteamLaunchObserverState,
      [signal],
      {
        correlations: [
          {
            appId: "1029210",
            launchId: "launch-1",
            playableId: "thirty-xx",
          },
        ],
      },
    )

    const summary = summaryFromSteamSnapshot({
      observerHealth: "running",
      snapshot: state.active,
    })

    expect(summary).toMatchObject({
      providerId: "@korri:steam",
      appId: "1029210",
      launchId: "launch-1",
      playableId: "thirty-xx",
      providerPhase: "install-script",
      lifecycleStatus: "active",
    })
  })
})
