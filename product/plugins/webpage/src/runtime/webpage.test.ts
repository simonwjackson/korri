import { describe, expect, it } from "bun:test"
import { createServer } from "node:net"
import { allocateCdpPort, terminateSpawnedChromium } from "./webpage"

describe("webpage launch plumbing", () => {
  it("allocates a CDP port that is not a fixed global port", async () => {
    const first = await allocateCdpPort()
    const second = await allocateCdpPort()

    expect(first).not.toBe(9222)
    expect(second).not.toBe(9222)
    expect(first).not.toBe(second)
  })

  it("allocates around an occupied port", async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    const occupied = server.address()
    if (!occupied || typeof occupied === "string") throw new Error("no port")
    try {
      const allocated = await allocateCdpPort()
      expect(allocated).not.toBe(occupied.port)
    } finally {
      server.close()
    }
  })

  it("terminates spawned Chromium processes on setup failure", async () => {
    const proc = Bun.spawn(["sh", "-c", "while true; do sleep 1; done"])
    await Bun.sleep(50)
    await terminateSpawnedChromium(proc, 1000)
    expect(await proc.exited).not.toBeNull()
  })
})
