import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { Effect } from "effect"
import { handleSourceStatus } from "./status.rpc-handler"

const originalEnv = {
  streamControl: process.env.KORRI_STREAM_CONTROL_ENABLED,
  statusPath: process.env.KORRI_GAME_STREAM_STATUS_PATH,
}
const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  setOptionalEnv("KORRI_STREAM_CONTROL_ENABLED", originalEnv.streamControl)
  setOptionalEnv("KORRI_GAME_STREAM_STATUS_PATH", originalEnv.statusPath)
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("app.source.status handler", () => {
  it("reports an enabled stream-capable source", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"

    const result = await Effect.runPromise(handleSourceStatus({}))

    expect(result).toMatchObject({
      status: "available",
      streamControl: "enabled",
      catalog: "available",
    })
  })

  it("reports disabled stream control without failing", async () => {
    process.env.KORRI_STREAM_CONTROL_ENABLED = "0"

    const result = await Effect.runPromise(handleSourceStatus({}))

    expect(result).toMatchObject({
      status: "stream-unavailable",
      streamControl: "disabled",
      catalog: "unavailable",
    })
  })

  it("includes existing runner mode when status is readable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-source-status-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
    process.env.KORRI_GAME_STREAM_STATUS_PATH = join(dir, "status.json")
    await writeFile(
      process.env.KORRI_GAME_STREAM_STATUS_PATH,
      `${JSON.stringify({ mode: "running" })}\n`,
    )

    const result = await Effect.runPromise(handleSourceStatus({}))

    expect(result.runnerMode).toBe("running")
  })

  it("integration: app.source.status is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.source.status")
  })
})

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
