import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHonoApp } from "@product/apps/portal/api/hono-app"
import { serverRpcHandler } from "@product/apps/portal/api/server/rpc-server"
import { decodeLaunchIntent } from "@product/services/device/game-stream-launch-intent"
import { withRpcServer } from "@tools/testing/library/with-rpc-server"
import { withTempProseqlLibrary } from "@tools/testing/library/with-temp-proseql-library"
import {
  createRemoteStreamControlClient,
  remoteSourceGamesFromCatalogSnapshot,
} from "./remote-stream-control-client"

const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}
const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  configRoots: process.env.KORRI_CONFIG_ROOTS,
  intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setWindowLocation(originalLocation)
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_CONFIG_ROOTS", originalEnv.configRoots)
  setOptionalEnv("KORRI_GAME_STREAM_INTENT_PATH", originalEnv.intentPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("remote stream control client", () => {
  it("filters remote source games from self-scoped catalog facts", () => {
    const games = remoteSourceGamesFromCatalogSnapshot(
      snapshotValue({
        entries: [
          catalogEntry("gba/wario-land-4", "Wario Land 4", {
            launch: { use: "moonlight" },
          }),
          catalogEntry("gba/not-ready", "Not Ready", {
            launchable: false,
            launch: { use: "moonlight" },
          }),
          catalogEntry("gba/no-app", "No App", {}),
        ],
      }),
    )

    expect(games.map(game => game.id)).toEqual(["gba/wario-land-4"])
  })

  it("surfaces failed self catalog facts as an unavailable source", () => {
    expect(() =>
      remoteSourceGamesFromCatalogSnapshot(
        snapshotValue({
          entries: [],
          selfStatus: "failed",
          selfError: "library unavailable",
        }),
      ),
    ).toThrow("library unavailable")
  })

  it("lists games, prepares known games, and reports disabled host control through the real RPC server", async () => {
    const { intentPath } = await setupRemoteLibrary({ enabled: true })
    await using server = await withRpcServer({
      fetch: createHonoApp({ rpcHandler: serverRpcHandler }).fetch,
    })
    pointWindowAt(server.url)
    const client = createRemoteStreamControlClient(server.url)

    const status = await client.sourceStatus()
    expect(status).toMatchObject({
      status: "available",
      streamControl: "enabled",
      catalog: "available",
    })

    const games = await client.listSourceGames()
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: "gba/wario-land-4",
      displayName: "Wario Land 4",
      streamable: true,
    })
    expect(games[0]?.source).toMatchObject({ isLocal: true })

    const prepared = await client.prepareGame("gba/wario-land-4")
    expect(prepared).toMatchObject({
      status: "prepared",
      gameId: "gba/wario-land-4",
    })
    expect(prepared.status).toBe("prepared")
    if (prepared.status !== "prepared") throw new Error("prepare failed")
    expect(prepared.sessionId).toBeString()
    if (!prepared.sessionId) throw new Error("missing session id")
    expect(prepared.intentPath).toBeUndefined()
    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")),
    )
    expect(intent.id).toBe(prepared.sessionId)
    expect(intent.launch.args).toContain("/srv/games/wl4.gba")

    process.env.KORRI_STREAM_CONTROL_ENABLED = "0"
    const disabledStatus = await client.sourceStatus()
    expect(disabledStatus).toMatchObject({
      status: "stream-unavailable",
      streamControl: "disabled",
    })
    const disabled = await client.prepareGame("gba/wario-land-4")
    expect(disabled).toMatchObject({
      status: "failed",
      category: "host-control-disabled",
    })
  })
})

async function setupRemoteLibrary(options: { readonly enabled: boolean }) {
  const library = await withTempProseqlLibrary({
    systems: [{ id: "gba" }],
    launchers: [
      {
        id: "mgba",
        command: "/bin/echo",
        args: ["{content.path}"],
        systems: ["gba"],
      },
    ],
    games: [
      {
        id: "gba/wario-land-4",
        system: "gba",
        contentPath: "/srv/games/wl4.gba",
        launch: { app: "mgba" },
        metadata: { name: "Wario Land 4" },
      },
    ],
  })
  cleanups.push(library.cleanup)

  const intentDir = await mkdtemp(join(tmpdir(), "korri-remote-stream-"))
  await chmod(intentDir, 0o700)
  cleanups.push(() => rm(intentDir, { recursive: true, force: true }))

  process.env.KORRI_LIBRARY_ROOT = library.root

  process.env.KORRI_CONFIG_ROOTS = library.root
  process.env.KORRI_GAME_STREAM_INTENT_PATH = join(
    intentDir,
    "next-launch.json",
  )
  process.env.KORRI_STREAM_CONTROL_ENABLED = options.enabled ? "1" : "0"
  delete process.env.XDG_RUNTIME_DIR

  return { intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH }
}

function pointWindowAt(baseUrl: string): void {
  const url = new URL(baseUrl)
  setWindowLocation({
    origin: url.origin,
    href: `${url.origin}/`,
    hostname: url.hostname,
    pathname: "/",
  })
}

function snapshotValue(options: {
  readonly entries: readonly ReturnType<typeof catalogEntry>[]
  readonly selfStatus?: "ready" | "loading" | "failed"
  readonly selfError?: string
}) {
  const status = options.selfStatus ?? "ready"
  return {
    entries: options.entries,
    peers: [
      {
        hostId: "self",
        displayName: "This Korri",
        controlUrl: "local://self",
        isLocal: true,
        caps: ["source"],
        status,
        entryCount: options.entries.length,
        ...(options.selfError ? { error: options.selfError } : {}),
      },
    ],
    generation: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    health: {
      self: status,
      remote: "ready",
      failedPeers: status === "failed" ? 1 : 0,
      ...(options.selfError ? { lastFailure: options.selfError } : {}),
    },
  }
}

function catalogEntry(
  id: string,
  title: string,
  options: {
    readonly launchable?: boolean
    readonly launch?: { readonly use?: string }
  },
) {
  const launchable = options.launchable ?? true
  return {
    id,
    itemId: id,
    title,
    system: "gba",
    releases: [
      {
        id: "gba",
        system: "gba",
        launchable,
        ...(options.launch ? { launch: options.launch } : {}),
      },
    ],
    launchable,
    metadata: { name: title },
    source: {
      hostId: "self",
      controlUrl: "local://self",
      isLocal: true,
    },
  }
}

function setWindowLocation(location: typeof originalLocation): void {
  Object.defineProperty(window.location, "origin", {
    value: location.origin,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: location.href,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "hostname", {
    value: location.hostname,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "pathname", {
    value: location.pathname,
    writable: true,
    configurable: true,
  })
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
