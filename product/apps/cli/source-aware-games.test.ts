import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@platform/fixtures/games/game"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { Effect } from "effect"
import type { StreamHostCandidate } from "./lan-stream-discovery"
import type { RemoteStreamControlClient } from "./remote-stream-control-client"
import { loadSourceAwareGames } from "./source-aware-games"

const host: StreamHostCandidate = {
  id: "aka",
  name: "aka",
  controlUrl: "http://aka.local:3001",
  source: "manual",
  capabilities: ["stream"],
  identityVerified: false,
}

describe("source-aware games", () => {
  it("combines local and remote entries without merging duplicate game ids", async () => {
    const result = await loadSourceAwareGames({
      localSource: localSource([
        {
          id: "gba/wario-land-4",
          system: "gba",
          contentPath: "/storage/roms/gba/wario-land-4.gba",
          metadata: { name: "Wario Land 4" },
        },
      ]),
      remoteHosts: [host],
      clientForHost: () =>
        remoteClient({
          games: [remoteGame("gba/wario-land-4", "Wario Land 4")],
        }),
    })

    expect(result.diagnostics).toEqual([])
    expect(result.entries).toHaveLength(2)
    expect(result.entries.map(entry => entry.source.kind)).toEqual([
      "local",
      "remote",
    ])
    expect(result.entries.map(entry => entry.choice.metadata?.name)).toEqual([
      "Wario Land 4 · local",
      "Wario Land 4 · aka",
    ])
  })

  it("keeps local entries when a remote host is unavailable", async () => {
    const result = await loadSourceAwareGames({
      localSource: localSource([
        {
          id: "nixpkgs/neverball",
          system: "nixpkgs",
          contentPath: "/storage/roms/nixpkgs/neverball",
        },
      ]),
      remoteHosts: [host],
      clientForHost: () =>
        remoteClient({ status: { status: "unavailable", message: "timeout" } }),
    })

    expect(result.entries.map(entry => entry.source.kind)).toEqual(["local"])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        sourceKind: "remote",
        category: "host-unavailable",
      }),
    ])
  })

  it("keeps remote entries when the local library fails", async () => {
    const result = await loadSourceAwareGames({
      localSource: failingLocalSource(),
      remoteHosts: [host],
      clientForHost: () =>
        remoteClient({
          games: [remoteGame("nixpkgs/neverball", "Neverball")],
        }),
    })

    expect(result.entries.map(entry => entry.source.kind)).toEqual(["remote"])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        sourceKind: "local",
        category: "library-unavailable",
      }),
    ])
  })

  it("does not list remote games when stream control is disabled", async () => {
    const result = await loadSourceAwareGames({
      localSource: localSource([]),
      remoteHosts: [host],
      clientForHost: () =>
        remoteClient({
          status: {
            status: "stream-unavailable",
            streamControl: "disabled",
            catalog: "unavailable",
            message: "disabled",
          },
        }),
    })

    expect(result.entries).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ category: "stream-unavailable" }),
    ])
  })
})

function remoteGame(
  id: string,
  displayName: string,
): Awaited<ReturnType<RemoteStreamControlClient["listSourceGames"]>>[number] {
  return {
    id,
    itemId: id,
    title: displayName,
    displayName,
    streamable: true,
    system: "remote",
    releases: [
      {
        id: "remote",
        system: "remote",
        launchable: true,
        apps: ["moonlight"],
      },
    ],
    launchable: true,
    metadata: { name: displayName },
    source: {
      hostId: "aka",
      controlUrl: "http://aka.local:3001",
      isLocal: true,
    },
  }
}

function localSource(games: readonly GameRecord[]): LibrarySourceService {
  return {
    list: () => Effect.succeed(games),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.fail(
        new LibraryError({ reason: "config", message: "not implemented" }),
      ),
  }
}

function failingLocalSource(): LibrarySourceService {
  return {
    list: () =>
      Effect.fail(
        new LibraryError({ reason: "unavailable", message: "local failed" }),
      ),
    launchSpecFor: () => Effect.succeed(undefined),
    resolveLaunchForGame: () =>
      Effect.fail(
        new LibraryError({ reason: "unavailable", message: "local failed" }),
      ),
  }
}

function remoteClient(options: {
  readonly status?: Awaited<
    ReturnType<RemoteStreamControlClient["sourceStatus"]>
  >
  readonly games?: Awaited<
    ReturnType<RemoteStreamControlClient["listSourceGames"]>
  >
}): RemoteStreamControlClient {
  return {
    listGames: async () => [],
    listSourceGames: async () => options.games ?? [],
    sourceStatus: async () =>
      options.status ?? {
        status: "available",
        streamControl: "enabled",
        catalog: "available",
      },
    prepareGame: async gameId => ({
      status: "prepared",
      gameId,
      intentPath: "/tmp/next-launch.json",
    }),
  }
}
