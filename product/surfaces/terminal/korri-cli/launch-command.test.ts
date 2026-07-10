import { describe, expect, it } from "bun:test"
import type {
  ControlLaunchResult,
  ControlSessionStatusResult,
} from "@platform/control/control-results"
import type { GameRecord } from "@platform/fixtures/games/game"
import type { LibrarySourceService } from "@platform/library/library-services"
import { LibraryError } from "@platform/library/library-services"
import type { StreamHostCandidate } from "@platform/stream/lan-stream-discovery"
import { Effect } from "effect"
import { type LocalLaunchRequest, runLaunchCommand } from "./launch-command"
import type { RemoteStreamControlClient } from "./remote-stream-control-client"

const SHARED_ID = "gba/wario-land-4"

const localGame: GameRecord = {
  id: SHARED_ID,
  system: "fixture",
  contentPath: "/storage/fixtures/gba/wario-land-4.rom",
  metadata: { name: "Wario Land 4" },
}
const remoteGame: Awaited<
  ReturnType<RemoteStreamControlClient["listSourceGames"]>
>[number] = {
  id: SHARED_ID,
  itemId: SHARED_ID,
  title: "Wario Land 4",
  displayName: "Wario Land 4",
  streamable: true,
  system: "remote",
  releases: [
    {
      id: "remote",
      system: "remote",
      launchable: true,
      launch: { use: "moonlight" },
    },
  ],
  launchable: true,
  metadata: { name: "Wario Land 4" },
  source: { hostId: "aka", controlUrl: "http://aka.local:3001", isLocal: true },
}
const host: StreamHostCandidate = {
  id: "aka",
  name: "aka",
  controlUrl: "http://aka.local:3001",
  source: "manual",
  capabilities: ["stream"],
  identityVerified: false,
}

function localSource(
  games: readonly GameRecord[],
  moonlight: Readonly<Record<string, unknown>> = { platform: { name: "sdl" } },
): LibrarySourceService {
  return {
    list: () => Effect.succeed(games),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.fail(new LibraryError({ reason: "config", message: "unused" })),
    resolveLocalLauncherPolicy: () =>
      Effect.succeed({
        launchCompanions: {},
        moonlight,
      }),
  }
}

function localSourceWithReleases(
  games: readonly GameRecord[],
  releaseIds: readonly string[],
): LibrarySourceService {
  return {
    ...localSource(games),
    listPlayableEntries: () =>
      Effect.succeed(
        games.map(game => ({
          id: game.id,
          itemId: game.id,
          title: game.metadata?.name ?? game.id,
          launchable: true,
          releases: releaseIds.map(id => ({
            id,
            system: "fixture",
            launchable: true,
          })),
        })),
      ),
  }
}

function launchedResult(id: string): ControlLaunchResult {
  return { _tag: "Launched", selection: { id } }
}

const activeStatus: ControlSessionStatusResult = {
  _tag: "SessionStatus",
  configured: true,
  mode: "game",
  active: {
    launchId: "launch-1",
    mode: "game",
    gameId: "old/game",
    title: "Old Game",
  },
  restoreAttempts: 0,
}
const idleStatus: ControlSessionStatusResult = {
  _tag: "SessionStatus",
  configured: true,
  mode: "idle",
  restoreAttempts: 0,
}

function remoteClient(
  overrides: {
    readonly prepared?: string[]
    readonly moonlightOrder?: string[]
    readonly prepareGame?: RemoteStreamControlClient["prepareGame"]
    readonly sourceStatus?: RemoteStreamControlClient["sourceStatus"]
  } = {},
): RemoteStreamControlClient {
  return {
    listGames: async () => [],
    listSourceGames: async () => [remoteGame],
    sourceStatus:
      overrides.sourceStatus ??
      (async () => ({
        status: "available",
        streamControl: "enabled",
        catalog: "available",
      })),
    prepareGame:
      overrides.prepareGame ??
      (async gameId => {
        overrides.prepared?.push(gameId)
        overrides.moonlightOrder?.push("prepare")
        return { status: "prepared", gameId, intentPath: "/tmp/x.json" }
      }),
  }
}

describe("unified launch command", () => {
  it("runs a local-only game through the control plane", async () => {
    let launched: LocalLaunchRequest | undefined
    const lines: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => {
        launched = request
        return launchedResult(request.id)
      },
      discoverHosts: async () => [],
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })
    expect(code).toBe(0)
    expect(launched?.id).toBe(SHARED_ID)
    expect(lines.join("\n")).toContain(`launched: ${SHARED_ID}`)
  })

  it("streams a remote-only game and attempts Moonlight", async () => {
    const order: string[] = []
    const lines: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient({ moonlightOrder: order }),
      launchMoonlight: async () => {
        order.push("moonlight")
        return { status: "started", command: "moonlight" }
      },
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })
    expect(code).toBe(0)
    expect(order).toEqual(["prepare", "moonlight"])
    expect(lines.join("\n")).toContain("Prepared Wario Land 4 from aka")
  })

  it("passes configured Moonlight stream ranges into remote Moonlight launch", async () => {
    let moonlightOptions: unknown
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([], {
        stream: {
          resolution: {
            min: { width: 640, height: 360 },
            start: { width: 1280, height: 720 },
            max: { width: 1920, height: 1080 },
          },
          fps: 120,
          bitrateKbps: { min: 500, start: 6000, max: 40000 },
        },
      }),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient(),
      launchMoonlight: async options => {
        moonlightOptions = options
        return { status: "started", command: "moonlight" }
      },
      output: () => {},
      errorOutput: () => {},
    })

    expect(code).toBe(0)
    expect(moonlightOptions).toMatchObject({
      moonlight: {
        stream: {
          resolution: {
            min: { width: 640, height: 360 },
            start: { width: 1280, height: 720 },
            max: { width: 1920, height: 1080 },
          },
          fps: 120,
          bitrateKbps: { min: 500, start: 6000, max: 40000 },
        },
      },
      adaptiveBoundaries: {
        levers: {
          resolution: {
            floor: { width: 640, height: 360 },
            ceiling: { width: 1920, height: 1080 },
          },
          fps: { floor: 120, ceiling: 120, pinned: 120 },
          bitrate: { floor: 500, startup: 6000, ceiling: 40000 },
        },
        outcomes: {},
      },
    })
  })

  it("passes adaptive stream boundary flags into remote Moonlight launch", async () => {
    let moonlightOptions: unknown
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient(),
      streamBoundaryArgs: ["bitrate=..12000", "lean=responsive"],
      launchMoonlight: async options => {
        moonlightOptions = options
        return { status: "started", command: "moonlight" }
      },
      output: () => {},
      errorOutput: () => {},
    })

    expect(code).toBe(0)
    expect(moonlightOptions).toMatchObject({
      adaptiveBoundaries: {
        levers: { bitrate: { ceiling: 12_000 } },
        outcomes: {},
        lean: 0,
      },
    })
  })

  it("fills missing startup bitrate before remote prepare", async () => {
    let moonlightOptions: unknown
    const lines: string[] = []
    const order: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () =>
        remoteClient({
          prepareGame: async gameId => {
            order.push(`prepare-after-${lines.length}`)
            return { status: "prepared", gameId, intentPath: "/tmp/x.json" }
          },
        }),
      streamBoundaryArgs: ["bitrate=500k..40m"],
      launchMoonlight: async options => {
        moonlightOptions = options
        return { status: "started", command: "moonlight" }
      },
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(code).toBe(0)
    expect(order).toEqual(["prepare-after-1"])
    expect(lines[0]).toContain("Stream preflight:")
    expect(moonlightOptions).toMatchObject({
      adaptiveBoundaries: {
        levers: {
          bitrate: { floor: 500, startup: 3_000, ceiling: 40_000 },
        },
      },
    })
  })

  it("rejects required preflight before remote prepare", async () => {
    const prepared: string[] = []
    const lines: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient({ prepared }),
      streamBoundaryArgs: ["bitrate=500k..40m"],
      streamPreflight: "required",
      launchMoonlight: async () => ({ status: "started", command: "moonlight" }),
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(code).toBe(8)
    expect(prepared).toEqual([])
    expect(lines.join("\n")).toContain("Stream preflight rejected launch")
  })

  it("prompts and launches when no game id is given", async () => {
    const code = await runLaunchCommand({
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      gamePicker: async choices => choices[0],
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
  })

  it("returns cancelled (130) when the picker is aborted", async () => {
    const code = await runLaunchCommand({
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      gamePicker: async () => undefined,
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(130)
  })

  it("returns usage (2) with no game id and no terminal", async () => {
    const code = await runLaunchCommand({
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      stdinIsTty: false,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(2)
  })

  it("returns ambiguous (4) when a game is on several machines and no terminal", async () => {
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient(),
      stdinIsTty: false,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(4)
  })

  it("scopes to a remote with --host without prompting", async () => {
    const prepared: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      host: "aka",
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient({ prepared }),
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(prepared).toEqual([SHARED_ID])
  })

  it("returns not-found (3) for an unknown game", async () => {
    const code = await runLaunchCommand({
      gameId: "does/not-exist",
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(3)
  })

  it("maps a remote host-unavailable prepare failure to host-unreachable (5)", async () => {
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () =>
        remoteClient({
          prepareGame: async () => ({
            status: "failed",
            category: "host-unavailable",
            message: "offline",
          }),
        }),
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(5)
  })

  it("maps a disabled remote control service to host-service-off (6)", async () => {
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([]),
      launchLocal: async () => launchedResult(SHARED_ID),
      discoverHosts: async () => [host],
      clientForHost: () =>
        remoteClient({
          prepareGame: async () => ({
            status: "failed",
            category: "host-control-disabled",
            message: "disabled",
          }),
        }),
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(6)
  })

  it("surfaces a failed local launch as launch-failed (10) with the child code in text", async () => {
    const lines: string[] = []
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => ({
        _tag: "LaunchFailed",
        selection: { id: request.id },
        exitCode: 7,
      }),
      discoverHosts: async () => [],
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })
    expect(code).toBe(10)
    expect(lines.join("\n")).toContain("exit=7")
  })

  it("prompts for a release when the game requires one", async () => {
    let launched: LocalLaunchRequest | undefined
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSourceWithReleases([localGame], ["genesis", "steam"]),
      launchLocal: async request => {
        launched = request
        return launchedResult(request.id)
      },
      discoverHosts: async () => [],
      releasePicker: async ids => ids[1],
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(launched?.releaseId).toBe("steam")
  })

  it("returns ambiguous (4) when a release is required and there is no terminal", async () => {
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSourceWithReleases([localGame], ["genesis", "steam"]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      stdinIsTty: false,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(4)
  })

  it("passes --release-id through without prompting", async () => {
    let launched: LocalLaunchRequest | undefined
    let prompted = false
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      releaseId: "steam",
      librarySource: localSourceWithReleases([localGame], ["genesis", "steam"]),
      launchLocal: async request => {
        launched = request
        return launchedResult(request.id)
      },
      discoverHosts: async () => [],
      releasePicker: async () => {
        prompted = true
        return "genesis"
      },
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(launched?.releaseId).toBe("steam")
    expect(prompted).toBe(false)
  })

  it("does not prompt when nothing is running", async () => {
    let prompted = false
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      sessionStatus: async () => idleStatus,
      confirmPrompt: async () => {
        prompted = true
        return true
      },
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(prompted).toBe(false)
  })

  it("launches after confirming termination of a running game", async () => {
    let prompted = ""
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      sessionStatus: async () => activeStatus,
      confirmPrompt: async message => {
        prompted = message
        return true
      },
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(prompted).toContain("Old Game")
  })

  it("returns cancelled (130) when the termination prompt is declined", async () => {
    let launchAttempted = false
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => {
        launchAttempted = true
        return launchedResult(request.id)
      },
      discoverHosts: async () => [],
      sessionStatus: async () => activeStatus,
      confirmPrompt: async () => false,
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(130)
    expect(launchAttempted).toBe(false)
  })

  it("skips the prompt with --yes", async () => {
    let prompted = false
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      confirmYes: true,
      librarySource: localSource([localGame]),
      launchLocal: async request => launchedResult(request.id),
      discoverHosts: async () => [],
      sessionStatus: async () => activeStatus,
      confirmPrompt: async () => {
        prompted = true
        return true
      },
      stdinIsTty: true,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(0)
    expect(prompted).toBe(false)
  })

  it("requires --yes to replace a running game without a terminal (usage 2)", async () => {
    let launchAttempted = false
    const code = await runLaunchCommand({
      gameId: SHARED_ID,
      librarySource: localSource([localGame]),
      launchLocal: async request => {
        launchAttempted = true
        return launchedResult(request.id)
      },
      discoverHosts: async () => [],
      sessionStatus: async () => activeStatus,
      stdinIsTty: false,
      output: () => {},
      errorOutput: () => {},
    })
    expect(code).toBe(2)
    expect(launchAttempted).toBe(false)
  })
})
