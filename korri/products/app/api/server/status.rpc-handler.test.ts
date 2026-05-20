import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { handleServerStatus } from "./status.rpc-handler"

const originalEnv = {
  statusPath: process.env.KORRI_GAME_STREAM_STATUS_PATH,
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  runtimeDir: process.env.XDG_RUNTIME_DIR,
  serverId: process.env.KORRI_SERVER_ID,
  serverName: process.env.KORRI_SERVER_NAME,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_GAME_STREAM_STATUS_PATH", originalEnv.statusPath)
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("XDG_RUNTIME_DIR", originalEnv.runtimeDir)
  setOptionalEnv("KORRI_SERVER_ID", originalEnv.serverId)
  setOptionalEnv("KORRI_SERVER_NAME", originalEnv.serverName)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.server.status handler", () => {
  it("reports server identity, capabilities, and fresh runner status", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_SERVER_ID = "aka"
    process.env.KORRI_SERVER_NAME = "Korri Stream on aka"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result).toMatchObject({
      serverId: "aka",
      displayName: "Korri Stream on aka",
      protocolVersion: "1",
      capabilities: ["source", "stream"],
      status: "available",
      streamControl: "enabled",
      catalog: "available",
      runner: { mode: "running", stale: false },
    })
    expect(result.runner?.observedAt).toBeString()
  })

  it("keeps disabled stream control observable", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "0"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result).toMatchObject({
      status: "stream-unavailable",
      streamControl: "disabled",
      catalog: "unavailable",
      message: "Korri stream control is not enabled",
    })
  })

  it("marks stale runner status as stale", async () => {
    const statusPath = await writeRunnerStatus({ mode: "running" })
    const stale = new Date(Date.now() - 20 * 60 * 1000)
    await utimes(statusPath, stale, stale)
    process.env.KORRI_GAME_STREAM_STATUS_PATH = statusPath
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"

    const result = await Effect.runPromise(handleServerStatus({}))

    expect(result.runner).toMatchObject({ mode: "running", stale: true })
  })
})

async function writeRunnerStatus(input: { readonly mode: string }) {
  const dir = await mkdtemp(join(tmpdir(), "korri-server-status-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const statusPath = join(dir, "status.json")
  await writeFile(statusPath, `${JSON.stringify(input)}\n`, { mode: 0o600 })
  return statusPath
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
