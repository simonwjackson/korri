import { describe, expect, it } from "bun:test"
import {
  dryRunLaunchExitCode,
  gameFindExitCode,
  gamesListExitCode,
  launchGameExitCode,
  renderDryRunLaunch,
  renderFindGame,
  renderGamesList,
  renderLaunchGame,
  renderSessionStatus,
  renderStopSession,
  sessionStatusExitCode,
  sessionStopExitCode,
} from "./control-renderers"

const game = {
  id: "snes/echo.smc",
  itemId: "snes/echo.smc",
  title: "Echo Runner",
  launchable: true,
  releases: [{ id: "default", system: "snes", launchable: true }],
}

const spec = { command: "/bin/echo", args: ["hello world"] }

describe("control renderers", () => {
  it("renders games list variants and exit codes", () => {
    expect(renderGamesList({ _tag: "GamesListed", games: [game] })).toBe(
      "snes/echo.smc\tEcho Runner",
    )
    expect(renderGamesList({ _tag: "GamesListed", games: [] })).toBe(
      "no games found",
    )
    expect(
      renderGamesList({ _tag: "ListGamesUnavailable", message: "offline" }),
    ).toBe("games unavailable: offline")
    expect(gamesListExitCode({ _tag: "GamesListed", games: [] })).toBe(0)
    expect(gamesListExitCode({ _tag: "ListGamesUnavailable" })).toBe(124)
  })

  it("renders find-game variants and exit codes", () => {
    expect(renderFindGame({ _tag: "GameFound", game, match: "exact-id" })).toBe(
      "snes/echo.smc\tEcho Runner",
    )
    expect(
      renderFindGame({
        _tag: "AmbiguousGame",
        query: "echo",
        candidates: [{ id: game.id, title: game.title }],
      }),
    ).toContain("ambiguous game query: echo")
    expect(
      renderFindGame({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe("game not found: missing")
    expect(
      renderFindGame({ _tag: "HostUnavailable", message: "offline" }),
    ).toBe("games unavailable: offline")
    expect(renderFindGame({ _tag: "MissingQuery" })).toBe(
      "game query is required",
    )
    expect(gameFindExitCode({ _tag: "GameFound", game, match: "title" })).toBe(
      0,
    )
    expect(gameFindExitCode({ _tag: "MissingQuery" })).toBe(64)
    expect(
      gameFindExitCode({ _tag: "AmbiguousGame", query: "e", candidates: [] }),
    ).toBe(64)
    expect(
      gameFindExitCode({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe(2)
    expect(gameFindExitCode({ _tag: "HostUnavailable" })).toBe(124)
  })

  it("renders dry-run launch variants and exit codes", () => {
    expect(
      renderDryRunLaunch({
        _tag: "LaunchDryRunOk",
        selection: { id: game.id },
        spec,
        readiness: { _tag: "SessionBusy", mode: "game" },
        caveats: ["remote peer not prepared"],
      }),
    ).toContain('command: /bin/echo "hello world"')
    expect(
      renderDryRunLaunch({
        _tag: "LaunchDryRunOk",
        selection: { id: game.id },
        spec,
        readiness: { _tag: "SessiondNotConfigured" },
        caveats: [],
      }),
    ).toContain("readiness: sessiond not configured")
    expect(
      renderDryRunLaunch({ _tag: "HostUnavailable", message: "offline" }),
    ).toBe("host unavailable: offline")
    expect(
      renderDryRunLaunch({
        _tag: "LaunchConfigFailed",
        selection: { id: game.id },
        message: "bad config",
      }),
    ).toBe("launch configuration failed: bad config")
    expect(
      renderDryRunLaunch({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe("game not found: missing")
    expect(
      dryRunLaunchExitCode({
        _tag: "LaunchDryRunOk",
        selection: { id: game.id },
        spec,
        readiness: { _tag: "SessionReady" },
        caveats: [],
      }),
    ).toBe(0)
    expect(
      dryRunLaunchExitCode({
        _tag: "LaunchConfigFailed",
        selection: { id: game.id },
        message: "bad config",
      }),
    ).toBe(78)
    expect(dryRunLaunchExitCode({ _tag: "HostUnavailable" })).toBe(124)
    expect(
      dryRunLaunchExitCode({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe(2)
  })

  it("renders launch variants and exit codes", () => {
    expect(
      renderLaunchGame({ _tag: "Launched", selection: { id: game.id } }),
    ).toBe("launched: snes/echo.smc")
    expect(
      renderLaunchGame({
        _tag: "PreflightRejected",
        selection: { id: game.id },
        message: "busy",
      }),
    ).toBe("launch preflight rejected: busy")
    expect(
      renderLaunchGame({
        _tag: "DaemonRejected",
        selection: { id: game.id },
        message: "busy",
      }),
    ).toBe("launch daemon rejected: busy")
    expect(
      renderLaunchGame({
        _tag: "HostUnavailable",
        selection: { id: game.id },
        message: "offline",
      }),
    ).toBe("host unavailable: offline")
    expect(
      renderLaunchGame({
        _tag: "LaunchFailed",
        selection: { id: game.id },
        exitCode: 7,
        stderrTail: "boom",
      }),
    ).toBe("launch failed: exit=7 boom")
    expect(
      renderLaunchGame({
        _tag: "LaunchConfigFailed",
        selection: { id: game.id },
        message: "bad config",
      }),
    ).toBe("launch configuration failed: bad config")
    expect(
      renderLaunchGame({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe("game not found: missing")
    expect(
      launchGameExitCode({ _tag: "Launched", selection: { id: game.id } }),
    ).toBe(0)
    expect(
      launchGameExitCode({
        _tag: "GameNotFound",
        query: "missing",
        candidates: [],
      }),
    ).toBe(2)
    expect(
      launchGameExitCode({
        _tag: "LaunchConfigFailed",
        selection: { id: game.id },
        message: "bad config",
      }),
    ).toBe(78)
    expect(
      launchGameExitCode({
        _tag: "PreflightRejected",
        selection: { id: game.id },
        message: "busy",
      }),
    ).toBe(121)
    expect(
      launchGameExitCode({
        _tag: "HostUnavailable",
        selection: { id: game.id },
        message: "offline",
      }),
    ).toBe(124)
    expect(
      launchGameExitCode({
        _tag: "LaunchFailed",
        selection: { id: game.id },
        exitCode: 7,
      }),
    ).toBe(7)
  })

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
