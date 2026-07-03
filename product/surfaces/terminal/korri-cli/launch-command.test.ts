import { describe, expect, it } from "bun:test"
import type { ControlLaunchResult } from "@platform/control/control-results"
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

function localSource(games: readonly GameRecord[]): LibrarySourceService {
  return {
    list: () => Effect.succeed(games),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.fail(new LibraryError({ reason: "config", message: "unused" })),
    resolveLocalLauncherPolicy: () =>
      Effect.succeed({
        launchCompanions: {},
        moonlight: { platform: { name: "sdl" } },
      }),
  }
}

function launchedResult(id: string): ControlLaunchResult {
  return { _tag: "Launched", selection: { id } }
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
})
