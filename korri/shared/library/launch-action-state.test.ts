import { describe, expect, it } from "bun:test"
import { launchActionStateFrom } from "./launch-action-state"

describe("launch action state", () => {
  it("allows launch when local and foreground gate are ready", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Idle" },
        foreground: { _tag: "Ready" },
      }),
    ).toEqual({ _tag: "Allowed" })
  })

  it("keeps local launching as the active explanation", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Launching", gameId: "gba/wario-land-4" },
        foreground: { _tag: "Ready" },
      }),
    ).toEqual({ _tag: "Launching", gameId: "gba/wario-land-4" })
  })

  it("blocks launch when another renderer has a running session", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Idle" },
        foreground: {
          _tag: "Running",
          requestId: "request-1",
          gameId: "gba/wario-land-4",
        },
      }),
    ).toEqual({
      _tag: "Blocked",
      reason: "running",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
    })
  })

  it("blocks launch during cleanup/readiness cooling", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Idle" },
        foreground: {
          _tag: "Cooling",
          state: "VerifyingReady",
          requestId: "request-1",
          gameId: "gba/wario-land-4",
        },
      }),
    ).toEqual({
      _tag: "Blocked",
      reason: "cooling",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
    })
  })

  it("blocks launch during recovery with a message", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Idle" },
        foreground: {
          _tag: "Recovering",
          state: "Recovering",
          requestId: "request-1",
          gameId: "gba/wario-land-4",
          message: "surface remained visible",
        },
      }),
    ).toEqual({
      _tag: "Blocked",
      reason: "recovering",
      requestId: "request-1",
      gameId: "gba/wario-land-4",
      message: "surface remained visible",
    })
  })

  it("does not block launch for unknown status transport failures", () => {
    expect(
      launchActionStateFrom({
        launch: { _tag: "Idle" },
        foreground: { _tag: "LoadError", message: "HTTP 500" },
      }),
    ).toEqual({ _tag: "AllowedWithUnknownStatus", message: "HTTP 500" })
  })
})
