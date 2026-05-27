import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createStatusSidecar,
  translateSessiondToGameStreamState,
} from "./sessiond-status-sidecar"

describe("translateSessiondToGameStreamState", () => {
  it("maps sessiond home/stopped to idle", () => {
    expect(translateSessiondToGameStreamState({ mode: "home" })).toEqual({
      mode: "idle",
    })
    expect(translateSessiondToGameStreamState({ mode: "stopped" })).toEqual({
      mode: "idle",
    })
  })

  it("maps sessiond launching to starting with runId carried", () => {
    expect(
      translateSessiondToGameStreamState({
        mode: "launching",
        launchId: "launch-1",
      }),
    ).toEqual({ mode: "starting", runId: "launch-1" })
  })

  it("maps sessiond game to running with runId and optional childPid", () => {
    expect(
      translateSessiondToGameStreamState({
        mode: "game",
        launchId: "launch-1",
        childPid: 42,
      }),
    ).toEqual({ mode: "running", runId: "launch-1", childPid: 42 })
  })

  it("maps sessiond restoring to stopping", () => {
    expect(
      translateSessiondToGameStreamState({
        mode: "restoring",
        launchId: "launch-1",
      }),
    ).toEqual({ mode: "stopping", runId: "launch-1" })
  })

  it("maps sessiond recovering to failed with failureReason", () => {
    expect(
      translateSessiondToGameStreamState({
        mode: "recovering",
        launchId: "launch-1",
        failureReason: "renderer crashed",
      }),
    ).toEqual({
      mode: "failed",
      runId: "launch-1",
      failureReason: "renderer crashed",
      failureStage: "cleanup",
    })
  })
})

describe("createStatusSidecar", () => {
  it("writes runner-shaped JSON via an injected writer", async () => {
    const writes: Array<{ readonly path: string; readonly content: string }> =
      []
    const sidecar = createStatusSidecar({
      path: "/tmp/status.json",
      writer: async (path, content) => {
        writes.push({ path, content })
      },
    })

    await sidecar.write({ mode: "launching", launchId: "launch-1" })

    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe("/tmp/status.json")
    expect(JSON.parse(writes[0].content)).toEqual({
      mode: "starting",
      runId: "launch-1",
    })
  })

  it("surfaces writer failures via the logger without throwing", async () => {
    const warnings: unknown[] = []
    const sidecar = createStatusSidecar({
      path: "/tmp/status.json",
      writer: async () => {
        throw new Error("disk full")
      },
      logger: {
        warn: (input: unknown) => warnings.push(input),
      },
    })

    await sidecar.write({ mode: "game", launchId: "launch-1" })

    expect(warnings.length).toBe(1)
    const payload = warnings[0] as { readonly err: Error }
    expect(payload.err.message).toBe("disk full")
  })

  it("is a no-op when no path is configured", async () => {
    let called = 0
    const sidecar = createStatusSidecar({
      path: undefined,
      writer: async () => {
        called += 1
      },
    })

    await sidecar.write({ mode: "home" })

    expect(called).toBe(0)
  })

  it("writes a real file with 0600 mode when using the default disk writer", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sessiond-sidecar-"))
    try {
      const path = join(dir, "status.json")
      const sidecar = createStatusSidecar({ path })

      await sidecar.write({ mode: "game", launchId: "live-launch" })

      const raw = await readFile(path, "utf8")
      const decoded = JSON.parse(raw) as Record<string, unknown>
      expect(decoded).toMatchObject({
        mode: "running",
        runId: "live-launch",
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
