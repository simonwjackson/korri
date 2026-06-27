import { describe, expect, it } from "bun:test"
import { launchStatusView } from "./launch-failure-copy"

describe("launchStatusView", () => {
  it("renders the normal hero for idle / no state", () => {
    expect(launchStatusView({ _tag: "Idle" })).toBeNull()
    expect(launchStatusView(undefined)).toBeNull()
  })

  it("maps the launching and launched stages", () => {
    expect(launchStatusView({ _tag: "Launching", gameId: "g" })).toMatchObject({
      tone: "launching",
      canRetry: false,
    })
    expect(launchStatusView({ _tag: "Launched", gameId: "g" })).toMatchObject({
      tone: "launched",
    })
  })

  it("maps a known failure kind to calm retryable copy", () => {
    expect(
      launchStatusView({
        _tag: "Failed",
        gameId: "g",
        exitCode: 1,
        failureKind: "command-failed",
      }),
    ).toMatchObject({
      tone: "failed",
      kicker: "Couldn't start",
      reason: "It didn't start",
      canRetry: true,
    })
  })

  it("marks no-such-game, host-control-disabled, and session-busy as non-retryable", () => {
    expect(
      launchStatusView({
        _tag: "Failed",
        gameId: "g",
        exitCode: 127,
        failureKind: "no-such-game",
      })?.canRetry,
    ).toBe(false)
    expect(
      launchStatusView({
        _tag: "Failed",
        gameId: "g",
        exitCode: 126,
        failureKind: "host-control-disabled",
      })?.canRetry,
    ).toBe(false)
    expect(
      launchStatusView({
        _tag: "Failed",
        gameId: "g",
        exitCode: 121,
        failureKind: "session-busy",
      }),
    ).toMatchObject({
      reason: "Another game is running",
      canRetry: false,
    })
  })

  it("falls back for failures without a kind and for defects", () => {
    expect(
      launchStatusView({ _tag: "Failed", gameId: "g", exitCode: 1 }),
    ).toMatchObject({ reason: "It didn't start", canRetry: true })
    expect(
      launchStatusView({ _tag: "Defect", gameId: "g", defect: "x" }),
    ).toMatchObject({
      tone: "failed",
      reason: "Something went wrong",
      canRetry: true,
    })
  })

  it("maps the unavailable state", () => {
    expect(
      launchStatusView({ _tag: "Unavailable", gameId: "g" }),
    ).toMatchObject({
      tone: "unavailable",
      canRetry: false,
    })
  })
})
