import { afterEach, describe, expect, it } from "bun:test"
import { createHonoApp } from "@app/api/hono-app"
import { serverRpcHandler } from "@app/api/server/rpc-server"
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeLaunchIntent } from "../device/game-stream-launch-intent"
import { withRpcServer } from "../testing/library/with-rpc-server"
import { withTempProseqlLibrary } from "../testing/library/with-temp-proseql-library"
import { createRemoteStreamControlClient } from "./remote-stream-control-client"

const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}
const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  intentPath: process.env.KORRI_GAME_STREAM_INTENT_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
  headlessSourceOnly: process.env.KORRI_HEADLESS_SOURCE_ONLY,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setWindowLocation(originalLocation)
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_GAME_STREAM_INTENT_PATH", originalEnv.intentPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  setOptionalEnv("KORRI_HEADLESS_SOURCE_ONLY", originalEnv.headlessSourceOnly)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("remote stream control client", () => {
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
    expect(games).toEqual([
      { id: "gba/wario-land-4", displayName: "Wario Land 4", streamable: true },
    ])

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
    games: [{ id: "gba/wario-land-4", metadata: { name: "Wario Land 4" } }],
    launcherProfiles: [
      {
        id: "nixpkgs.mgba.gba",
        command: "/bin/echo",
        args: ["{contentPath}"],
      },
    ],
    launchTargets: [
      {
        id: "gba/wario-land-4",
        profile: "nixpkgs.mgba.gba",
        contentPath: "/srv/games/wl4.gba",
      },
    ],
  })
  cleanups.push(library.cleanup)

  const intentDir = await mkdtemp(join(tmpdir(), "korri-remote-stream-"))
  await chmod(intentDir, 0o700)
  cleanups.push(() => rm(intentDir, { recursive: true, force: true }))

  process.env.KORRI_LIBRARY_ROOT = library.root
  process.env.KORRI_GAME_STREAM_INTENT_PATH = join(
    intentDir,
    "next-launch.json",
  )
  process.env.KORRI_STREAM_CONTROL_ENABLED = options.enabled ? "1" : "0"
  delete process.env.XDG_RUNTIME_DIR
  delete process.env.KORRI_HEADLESS_SOURCE_ONLY

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
