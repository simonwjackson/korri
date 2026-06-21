import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import type { LibrarySourceService } from "@platform/library/library-services"
import { Effect } from "effect"
import type { StreamHostCandidate } from "./lan-stream-discovery"
import type { RemoteStreamControlClient } from "./remote-stream-control-client"
import { runRemoteStreamLaunchCommand } from "./remote-stream-launch"

const host: StreamHostCandidate = {
  id: "aka",
  name: "aka",
  controlUrl: "http://aka.local:3010",
  source: "mdns",
  capabilities: ["stream"],
  identityVerified: false,
}
const game: GameRecord = {
  id: "gba/wario-land-4",
  system: "gba",
  contentPath: "/storage/roms/gba/wario-land-4.gba",
  metadata: { name: "Wario Land 4" },
}
const wrapperProvider = "@example:wrapper"
type WrapperPolicy = { readonly enable?: boolean }

describe("remote stream launch command", () => {
  it("discovers remote games, prepares the selected game, and attempts Moonlight", async () => {
    const lines: string[] = []
    const prepared: string[] = []
    const exitCode = await runRemoteStreamLaunchCommand({
      discoverHosts: async () => [host],
      clientForHost: () => client({ games: [game], prepared }),
      gamePicker: async games => games[0],
      librarySource: localSource(),
      stdinIsTty: true,
      launchMoonlight: async moonlightOptions => {
        expect(moonlightOptions.host).toBe("aka")
        expect(moonlightOptions.moonlight?.platform?.name).toBe("sdl")
        expect(
          (
            moonlightOptions.launchCompanions?.[wrapperProvider] as
              | WrapperPolicy
              | undefined
          )?.enable,
        ).toBe(false)
        return { status: "started", command: "moonlight" }
      },
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(prepared).toEqual(["gba/wario-land-4"])
    expect(lines.join("\n")).toContain(
      "Prepared Wario Land 4 from aka for Korri Stream",
    )
    expect(lines.join("\n")).toContain("Moonlight launch attempted")
  })

  it("uses manual host fallback when supplied", async () => {
    let manualHost: string | undefined
    const exitCode = await runRemoteStreamLaunchCommand({
      host: "http://aka.local:3010",
      discoverHosts: async options => {
        manualHost = options.manualHost
        return [host]
      },
      clientForHost: () => client({ games: [game] }),
      gamePicker: async games => games[0],
      stdinIsTty: true,
      launchMoonlight: async () => ({
        status: "started",
        command: "moonlight",
      }),
    })

    expect(exitCode).toBe(0)
    expect(manualHost).toBe("http://aka.local:3010")
  })

  it("keeps staging success when Moonlight fails", async () => {
    const lines: string[] = []
    const exitCode = await runRemoteStreamLaunchCommand({
      discoverHosts: async () => [host],
      clientForHost: () => client({ games: [game] }),
      gamePicker: async games => games[0],
      stdinIsTty: true,
      launchMoonlight: async () => ({
        status: "failed",
        message: "moonlight missing",
      }),
      output: line => lines.push(line),
      errorOutput: line => lines.push(line),
    })

    expect(exitCode).toBe(0)
    expect(lines.join("\n")).toContain("Remote staging succeeded")
    expect(lines.join("\n")).toContain("moonlight missing")
  })

  it("does not attempt Moonlight when prepare fails", async () => {
    let moonlightAttempted = false
    const errors: string[] = []
    const exitCode = await runRemoteStreamLaunchCommand({
      discoverHosts: async () => [host],
      clientForHost: () =>
        client({
          games: [game],
          prepareResult: {
            status: "failed",
            category: "host-control-disabled",
            message: "stream control disabled",
          },
        }),
      gamePicker: async games => games[0],
      stdinIsTty: true,
      launchMoonlight: async () => {
        moonlightAttempted = true
        return { status: "started", command: "moonlight" }
      },
      errorOutput: line => errors.push(line),
    })

    expect(exitCode).toBe(5)
    expect(moonlightAttempted).toBe(false)
    expect(errors.join("\n")).toContain("stream control disabled")
  })

  it("fails clearly when no hosts are discovered", async () => {
    const errors: string[] = []
    const exitCode = await runRemoteStreamLaunchCommand({
      discoverHosts: async () => [],
      errorOutput: line => errors.push(line),
    })

    expect(exitCode).toBe(4)
    expect(errors.join("\n")).toContain("No streamable Korri hosts")
  })
})

function localSource(): LibrarySourceService {
  return {
    list: () => Effect.succeed([]),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.succeed({ spec: { command: "true", args: [] } }),
    resolveLocalLauncherPolicy: () =>
      Effect.succeed({
        launchCompanions: { [wrapperProvider]: { enable: false } },
        moonlight: { platform: { name: "sdl" } },
      }),
  }
}

function client(options: {
  readonly games: readonly GameRecord[]
  readonly prepared?: string[]
  readonly prepareResult?: Awaited<
    ReturnType<RemoteStreamControlClient["prepareGame"]>
  >
}): RemoteStreamControlClient {
  return {
    listGames: async () => options.games,
    listSourceGames: async () =>
      options.games.map(game => ({
        id: game.id,
        itemId: game.id,
        title: game.metadata?.name ?? game.id,
        displayName: game.metadata?.name ?? game.id,
        streamable: true,
        system: game.system,
        releases: [
          {
            id: game.system,
            system: game.system,
            launchable: true,
            launch: { use: "moonlight" },
          },
        ],
        launchable: true,
        metadata: game.metadata,
        source: {
          hostId: "aka",
          controlUrl: "http://aka.local:3001",
          isLocal: true,
        },
      })),
    sourceStatus: async () => ({
      status: "available",
      streamControl: "enabled",
      catalog: "available",
    }),
    prepareGame: async gameId => {
      options.prepared?.push(gameId)
      return (
        options.prepareResult ?? {
          status: "prepared",
          gameId,
          intentPath: "/tmp/next-launch.json",
        }
      )
    },
  }
}
