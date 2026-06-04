import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import type { LaunchResult, LaunchSpec } from "@platform/library/launcher"
import {
  type LauncherService,
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { Effect } from "effect"
import type { StreamHostCandidate } from "./lan-stream-discovery"
import type { RemoteStreamControlClient } from "./remote-stream-control-client"
import { runSourceAwarePlayCommand } from "./source-aware-play"

const localGame: GameRecord = {
  id: "nixpkgs/neverball",
  system: "fixture",
  contentPath: "/storage/fixtures/nixpkgs/neverball.rom",
  metadata: { name: "Neverball" },
}
const remoteGame = {
  id: "gba/wario-land-4",
  displayName: "Wario Land 4",
  streamable: true,
}
const host: StreamHostCandidate = {
  id: "aka",
  name: "aka",
  controlUrl: "http://aka.local:3001",
  source: "manual",
  capabilities: ["stream"],
  identityVerified: false,
}
const spec: LaunchSpec = { command: "/bin/echo", args: ["ok"] }

describe("source-aware play command", () => {
  it("launches a selected local entry without remote prepare or Moonlight", async () => {
    let launched: LaunchSpec | undefined
    let remotePrepared = false
    let moonlightAttempted = false
    const lines: string[] = []

    const exitCode = await runSourceAwarePlayCommand({
      librarySource: localSource([localGame], spec),
      launcher: launcher(async launchSpec => {
        launched = launchSpec
        return { status: "launched" }
      }),
      discoverHosts: async () => [host],
      clientForHost: () =>
        remoteClient({
          prepareGame: async () => {
            remotePrepared = true
            return {
              status: "prepared",
              gameId: remoteGame.id,
              intentPath: "/tmp/x",
            }
          },
        }),
      gamePicker: async games =>
        games.find(game => game.metadata?.name?.includes("local")),
      stdinIsTty: true,
      launchMoonlight: async () => {
        moonlightAttempted = true
        return { status: "started", command: "moonlight" }
      },
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(launched).toEqual(spec)
    expect(remotePrepared).toBe(false)
    expect(moonlightAttempted).toBe(false)
    expect(lines.join("\n")).toContain("Launched Neverball locally")
  })

  it("prepares a selected remote entry and attempts Moonlight", async () => {
    const prepared: string[] = []
    const lines: string[] = []

    const exitCode = await runSourceAwarePlayCommand({
      librarySource: localSource([localGame], spec),
      launcher: launcher(async () => ({ status: "launched" })),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient({ prepared }),
      gamePicker: async games =>
        games.find(game => game.metadata?.name?.includes("aka")),
      stdinIsTty: true,
      launchMoonlight: async moonlightOptions => {
        expect(moonlightOptions.host).toBe("aka")
        return { status: "started", command: "moonlight" }
      },
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(prepared).toEqual(["gba/wario-land-4"])
    expect(lines.join("\n")).toContain("Prepared Wario Land 4 from aka")
  })

  it("keeps local entries usable when a remote source is unavailable", async () => {
    const lines: string[] = []

    const exitCode = await runSourceAwarePlayCommand({
      librarySource: localSource([localGame], spec),
      launcher: launcher(async () => ({ status: "launched" })),
      discoverHosts: async () => [host],
      clientForHost: () =>
        remoteClient({
          sourceStatus: async () => ({
            status: "unavailable",
            message: "timeout",
          }),
        }),
      gamePicker: async games => games[0],
      stdinIsTty: true,
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(lines.join("\n")).toContain("aka: timeout")
    expect(lines.join("\n")).toContain("Launched Neverball locally")
  })

  it("reports staging success when Moonlight cannot start", async () => {
    const lines: string[] = []

    const exitCode = await runSourceAwarePlayCommand({
      librarySource: localSource([], spec),
      launcher: launcher(async () => ({ status: "launched" })),
      discoverHosts: async () => [host],
      clientForHost: () => remoteClient({}),
      gamePicker: async games => games[0],
      stdinIsTty: true,
      launchMoonlight: async () => ({ status: "failed", message: "missing" }),
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(lines.join("\n")).toContain("Remote staging succeeded")
    expect(lines.join("\n")).toContain("missing")
  })
})

function localSource(
  games: readonly GameRecord[],
  launchSpec: LaunchSpec | undefined,
): LibrarySourceService {
  return {
    list: () => Effect.succeed(games),
    launchSpecFor: id =>
      Effect.succeed(
        games.some(game => game.id === id) ? launchSpec : undefined,
      ),
    resolveLaunchForGame: id =>
      games.some(game => game.id === id) && launchSpec
        ? Effect.succeed({ spec: launchSpec })
        : Effect.fail(
            new LibraryError({
              reason: "config",
              message: "no spec configured",
            }),
          ),
  }
}

function launcher(
  run: (spec: LaunchSpec) => Promise<LaunchResult>,
): LauncherService {
  return { run: spec => Effect.promise(() => run(spec)) }
}

function remoteClient(options: {
  readonly prepared?: string[]
  readonly sourceStatus?: RemoteStreamControlClient["sourceStatus"]
  readonly prepareGame?: RemoteStreamControlClient["prepareGame"]
}): RemoteStreamControlClient {
  return {
    listGames: async () => [],
    listSourceGames: async () => [remoteGame],
    sourceStatus:
      options.sourceStatus ??
      (async () => ({
        status: "available",
        streamControl: "enabled",
        catalog: "available",
      })),
    prepareGame:
      options.prepareGame ??
      (async gameId => {
        options.prepared?.push(gameId)
        return {
          status: "prepared",
          gameId,
          intentPath: "/tmp/next-launch.json",
        }
      }),
  }
}
