import { describe, expect, it } from "bun:test"
import {
  renderSessionStatus,
  renderStopSession,
  sessionStatusExitCode,
  sessionStopExitCode,
} from "./control-renderers"

describe("control renderers", () => {
  it("renders session status variants", () => {
    expect(
      renderSessionStatus({
        _tag: "SessionStatus",
        configured: true,
        mode: "game",
        active: { launchId: "launch-1", mode: "game" },
        restoreAttempts: 2,
      }),
    ).toBe("sessiond configured mode=game active=launch-1 restoreAttempts=2")
    expect(
      renderSessionStatus({
        _tag: "SessionStatus",
        configured: true,
        mode: "idle",
        restoreAttempts: 0,
      }),
    ).toBe("sessiond configured mode=idle active=none restoreAttempts=0")
    expect(renderSessionStatus({ _tag: "SessiondNotConfigured" })).toBe(
      "sessiond not configured",
    )
    expect(
      renderSessionStatus({ _tag: "HostUnavailable", message: "offline" }),
    ).toBe("sessiond unavailable: offline")
  })

  it("maps session status exit codes", () => {
    expect(
      sessionStatusExitCode({
        _tag: "SessionStatus",
        configured: true,
        mode: "idle",
        restoreAttempts: 0,
      }),
    ).toBe(0)
    expect(sessionStatusExitCode({ _tag: "SessiondNotConfigured" })).toBe(0)
    expect(sessionStatusExitCode({ _tag: "HostUnavailable" })).toBe(124)
  })

  it("renders stop-session variants", () => {
    expect(
      renderStopSession({
        _tag: "Stopped",
        launchId: "launch-1",
        force: false,
      }),
    ).toBe("stop requested for launch-1")
    expect(
      renderStopSession({ _tag: "Stopped", launchId: "launch-1", force: true }),
    ).toBe("force stop requested for launch-1")
    expect(renderStopSession({ _tag: "NothingToStop" })).toBe(
      "no active session to stop",
    )
    expect(renderStopSession({ _tag: "SessiondNotConfigured" })).toBe(
      "sessiond not configured",
    )
    expect(renderStopSession({ _tag: "HostUnavailable" })).toBe(
      "sessiond unavailable",
    )
    expect(
      renderStopSession({
        _tag: "ConfirmationRequired",
        action: "force-stop-session",
      }),
    ).toBe("force stop requires --yes")
    expect(
      renderStopSession({
        _tag: "ConfirmationRequired",
        action: "stop-session",
      }),
    ).toBe("stop requires --yes")
  })

  it("maps stop-session exit codes", () => {
    expect(
      sessionStopExitCode({
        _tag: "Stopped",
        launchId: "launch-1",
        force: false,
      }),
    ).toBe(0)
    expect(sessionStopExitCode({ _tag: "NothingToStop" })).toBe(0)
    expect(sessionStopExitCode({ _tag: "HostUnavailable" })).toBe(124)
    expect(
      sessionStopExitCode({
        _tag: "ConfirmationRequired",
        action: "stop-session",
      }),
    ).toBe(64)
    expect(sessionStopExitCode({ _tag: "SessiondNotConfigured" })).toBe(2)
  })
})
