import { describe, expect, it } from "bun:test"
import {
  beginKorriLaunch,
  beginKorriRestore,
  completeKorriRestore,
  evaluateHomeInvariant,
  failKorriRestore,
  initialKorriSessionState,
  korriSessionActiveLaunch,
  markKorriGameRunning,
  markKorriHome,
  shouldEnforceHomeInvariant,
  shouldStopAfterRestoreFailure,
  startKorriSession,
  stopKorriSession,
} from "./sessiond-state"

describe("korri session state", () => {
  it("enables home invariant enforcement after start reaches home", () => {
    const starting = startKorriSession(initialKorriSessionState)
    expect(starting.mode).toBe("starting")
    expect(shouldEnforceHomeInvariant(starting)).toBe(false)

    const home = markKorriHome(starting)
    expect(home.mode).toBe("home")
    expect(shouldEnforceHomeInvariant(home)).toBe(true)
  })

  it("suspends home invariant enforcement while a launch/game owns the screen", () => {
    const home = markKorriHome(startKorriSession())
    const launching = beginKorriLaunch(home, "launch-1")
    const game = markKorriGameRunning(launching)

    expect(launching.mode).toBe("launching")
    expect(game.mode).toBe("game")
    expect(shouldEnforceHomeInvariant(launching)).toBe(false)
    expect(shouldEnforceHomeInvariant(game)).toBe(false)
  })

  it("carries the active launch identity while active and clears it after restore", () => {
    const launching = beginKorriLaunch(
      markKorriHome(startKorriSession()),
      "launch-1",
    )
    const game = markKorriGameRunning(launching)
    const restored = completeKorriRestore(beginKorriRestore(game))

    expect(korriSessionActiveLaunch(launching)).toEqual({
      launchId: "launch-1",
      mode: "launching",
    })
    expect(korriSessionActiveLaunch(game)).toEqual({
      launchId: "launch-1",
      mode: "game",
    })
    expect(korriSessionActiveLaunch(restored)).toBeUndefined()
  })

  it("re-enables home invariant enforcement after restore succeeds", () => {
    const game = markKorriGameRunning(
      beginKorriLaunch(markKorriHome(startKorriSession()), "launch-1"),
    )
    const restored = completeKorriRestore(beginKorriRestore(game))

    expect(restored.mode).toBe("home")
    expect(shouldEnforceHomeInvariant(restored)).toBe(true)
  })

  it("moves repeated restore failures into recovering with a stop signal", () => {
    let state = beginKorriRestore(
      markKorriGameRunning(
        beginKorriLaunch(markKorriHome(startKorriSession()), "launch-1"),
      ),
    )

    state = failKorriRestore(state, "renderer missing")
    expect(state).toMatchObject({
      mode: "recovering",
      restoreAttempts: 1,
      failureReason: "renderer missing",
    })
    expect(shouldStopAfterRestoreFailure(state)).toBe(false)

    state = failKorriRestore(state, "renderer missing")
    state = failKorriRestore(state, "renderer missing")
    expect(shouldStopAfterRestoreFailure(state)).toBe(true)
  })

  it("stops from any state and disables invariant enforcement", () => {
    const stopped = stopKorriSession()

    expect(stopped).toEqual(initialKorriSessionState)
    expect(shouldEnforceHomeInvariant(stopped)).toBe(false)
  })

  // Task-009 coverage gap: \`beginKorriLaunch\` from any non-home mode
  // must reject the launch with a structured \`recovering\`/\`failureReason\`
  // state rather than silently accepting it. The reject branch is the
  // operator's signal that a managed launch arrived while sessiond was
  // mid-restore or already in-game.
  it("beginKorriLaunch from non-home mode flips to recovering with a structured failureReason", () => {
    const startedFromStopped = beginKorriLaunch(
      initialKorriSessionState,
      "launch-from-stopped",
    )
    expect(startedFromStopped.mode).toBe("recovering")
    expect(startedFromStopped.failureReason).toBe("cannot launch from stopped")
    // launchId is intentionally NOT propagated on rejection — the
    // operator-facing failureReason carries the cause and the
    // attempted launchId is dropped to avoid implying the launch
    // was accepted.
    expect(startedFromStopped.launchId).toBeUndefined()
  })

  it("beginKorriLaunch from game mode (re-entry attempt) flips to recovering with a structured failureReason", () => {
    const home = markKorriHome(startKorriSession())
    const game = markKorriGameRunning(beginKorriLaunch(home, "launch-1"))
    expect(game.mode).toBe("game")

    const reentry = beginKorriLaunch(game, "launch-2")
    expect(reentry.mode).toBe("recovering")
    expect(reentry.failureReason).toBe("cannot launch from game")
  })
})

describe("home invariant evaluation", () => {
  it("asks to relaunch the renderer when no Korri window exists", () => {
    expect(evaluateHomeInvariant({ windows: [] })).toEqual([
      { kind: "relaunch-renderer", reason: "missing-window" },
    ])
  })

  it("no-ops when exactly one Korri window is focused and fullscreen", () => {
    expect(
      evaluateHomeInvariant({
        windows: [{ id: 7, focused: true, fullscreen: true }],
      }),
    ).toEqual([{ kind: "noop", primaryWindowId: 7 }])
  })

  it("asks to repair focus and fullscreen for a non-compliant window", () => {
    expect(
      evaluateHomeInvariant({
        windows: [{ id: 7, focused: false, fullscreen: false }],
      }),
    ).toEqual([
      {
        kind: "repair-window",
        windowId: 7,
        repairs: ["focus", "fullscreen"],
      },
    ])
  })

  it("chooses the focused duplicate as primary and asks to close the rest", () => {
    expect(
      evaluateHomeInvariant({
        windows: [
          { id: 12, focused: false, fullscreen: true },
          { id: 9, focused: true, fullscreen: true },
        ],
      }),
    ).toEqual([
      {
        kind: "close-duplicate-windows",
        primaryWindowId: 9,
        duplicateWindowIds: [12],
      },
    ])
  })
})
