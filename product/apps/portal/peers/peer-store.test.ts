import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeFilePeerStore } from "./peer-store"

describe("file peer store", () => {
  let dir: string
  let env: NodeJS.ProcessEnv

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "korri-peerstore-"))
    env = { XDG_STATE_HOME: dir }
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const peer = (
    over: Partial<
      Parameters<ReturnType<typeof makeFilePeerStore>["remember"]>[0]
    > = {},
  ) => ({
    hostId: "aka",
    controlUrl: "http://aka:3001",
    displayName: "Korri Stream on aka",
    caps: ["source", "stream"] as readonly string[],
    source: "mdns" as const,
    ...over,
  })

  it("round-trips a remembered peer with all fields", async () => {
    const store = makeFilePeerStore({
      env,
      now: () => "2026-06-14T00:00:00.000Z",
    })
    await store.remember(peer())

    const loaded = await store.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      hostId: "aka",
      controlUrl: "http://aka:3001",
      displayName: "Korri Stream on aka",
      caps: ["source", "stream"],
      source: "mdns",
      firstSeenAt: "2026-06-14T00:00:00.000Z",
      lastSeenAt: "2026-06-14T00:00:00.000Z",
    })
  })

  it("updates controlUrl and lastSeenAt but preserves firstSeenAt on re-remember", async () => {
    let clock = "2026-06-14T00:00:00.000Z"
    const store = makeFilePeerStore({ env, now: () => clock })
    await store.remember(peer())

    clock = "2026-06-14T01:00:00.000Z"
    await store.remember(peer({ controlUrl: "http://aka:3999" }))

    const loaded = await store.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({
      controlUrl: "http://aka:3999",
      firstSeenAt: "2026-06-14T00:00:00.000Z",
      lastSeenAt: "2026-06-14T01:00:00.000Z",
    })
  })

  it("returns an empty set when no file exists yet", async () => {
    const store = makeFilePeerStore({ env })
    expect(await store.load()).toEqual([])
  })

  it("tolerates a corrupt file by returning an empty set", async () => {
    mkdirSync(join(dir, "korri"), { recursive: true })
    writeFileSync(join(dir, "korri", "peers.json"), "{ not valid json")
    const store = makeFilePeerStore({ env })
    expect(await store.load()).toEqual([])
  })

  it("never persists the local host", async () => {
    const store = makeFilePeerStore({ env, localHostId: "aka" })
    await store.remember(peer({ hostId: "aka" }))
    expect(await store.load()).toEqual([])
  })

  it("persists multiple peers and survives a fresh instance (restart)", async () => {
    const writer = makeFilePeerStore({
      env,
      now: () => "2026-06-14T00:00:00.000Z",
    })
    await writer.remember(
      peer({ hostId: "aka", controlUrl: "http://aka:3001" }),
    )
    await writer.remember(
      peer({ hostId: "sobo", controlUrl: "http://sobo:3001" }),
    )

    const reader = makeFilePeerStore({ env })
    const loaded = await reader.load()
    expect(loaded.map(p => p.hostId).sort()).toEqual(["aka", "sobo"])
  })

  it("forgets a peer by hostId", async () => {
    const store = makeFilePeerStore({ env })
    await store.remember(peer({ hostId: "aka" }))
    await store.remember(peer({ hostId: "sobo" }))
    await store.forget("aka")
    expect((await store.load()).map(p => p.hostId)).toEqual(["sobo"])
  })
})
