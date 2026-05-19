import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  createFileGameStreamLaunchIntentStore,
  createLaunchIntent,
} from "./game-stream-launch-intent"

const launch: LaunchSpec = {
  command: "/nix/store/firefox/bin/firefox",
  args: ["https://korri.local"],
  env: { KORRI_TEST: "1" },
  cwd: "/tmp",
}

describe("game stream launch intent store", () => {
  it("atomically enqueues and consumes one arbitrary launch intent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    const intent = createLaunchIntent(launch)

    await store.enqueue(intent)

    expect((await stat(intentPath)).mode & 0o777).toBe(0o600)
    await expect(store.consume()).resolves.toEqual(intent)
    await expect(store.consume()).resolves.toBeUndefined()
  })

  it("fails malformed launch intents without deleting them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-game-stream-intent-"))
    const intentPath = join(dir, "next-launch.json")
    const store = createFileGameStreamLaunchIntentStore(intentPath)
    await writeFile(intentPath, JSON.stringify({ version: 1 }), { mode: 0o600 })

    await expect(store.consume()).rejects.toThrow("launch intent id")
    expect(await readFile(intentPath, "utf8")).toContain('"version"')
  })
})
