import { describe, expect, it } from "bun:test"
import { launchStatusView } from "./launch-failure-copy"

describe("launchStatusView", () => {
  it("renders the normal hero for idle / no state", () => {
    expect(launchStatusView({ _tag: "Idle" })).toBeNull()
    expect(launchStatusView(undefined)).toBeNull()
  })

  it("maps launch request and foreground runtime stages separately", () => {
    expect(launchStatusView({ _tag: "Launching", gameId: "g" })).toMatchObject({
      tone: "launching",
      canRetry: false,
    })
    expect(launchStatusView({ _tag: "Accepted", gameId: "g" })).toBeNull()
    expect(
      launchStatusView({ _tag: "Accepted", gameId: "g" }, { _tag: "Running" }),
    ).toMatchObject({
      tone: "launched",
      kicker: "Now playing",
      canRetry: false,
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
    expect(
      launchStatusView({
        _tag: "Failed",
        gameId: "g",
        exitCode: 120,
        failureKind: "fake-suspend-active",
      }),
    ).toMatchObject({
      reason: "Wake the device first",
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
