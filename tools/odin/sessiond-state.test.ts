import { describe, expect, it } from "bun:test"
import {
  beginKorriLaunch,
  beginKorriRestore,
  completeKorriRestore,
  evaluateHomeInvariant,
  failKorriRestore,
  initialKorriSessionState,
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

    state = failKorriRestore(state, "chromium missing")
    expect(state).toMatchObject({
      mode: "recovering",
      restoreAttempts: 1,
      failureReason: "chromium missing",
    })
    expect(shouldStopAfterRestoreFailure(state)).toBe(false)

    state = failKorriRestore(state, "chromium missing")
    state = failKorriRestore(state, "chromium missing")
    expect(shouldStopAfterRestoreFailure(state)).toBe(true)
  })

  it("stops from any state and disables invariant enforcement", () => {
    const stopped = stopKorriSession()

    expect(stopped).toEqual(initialKorriSessionState)
    expect(shouldEnforceHomeInvariant(stopped)).toBe(false)
  })
})

describe("home invariant evaluation", () => {
  it("asks to relaunch Chromium when no Korri window exists", () => {
    expect(evaluateHomeInvariant({ windows: [] })).toEqual([
      { kind: "relaunch-chromium", reason: "missing-window" },
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
