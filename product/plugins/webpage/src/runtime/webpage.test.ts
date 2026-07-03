import { describe, expect, it } from "bun:test"
import { createServer } from "node:net"
import {
  allocateCdpPort,
  installWebpageTerminationHandlers,
  terminateSpawnedChromium,
} from "./webpage"

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

  it("forwards runtime termination signals to spawned Chromium", async () => {
    const proc = Bun.spawn(["sh", "-c", "while true; do sleep 1; done"])
    const listeners = new Map<string, () => void>()
    let exitCode: number | undefined
    const dispose = installWebpageTerminationHandlers(proc, {
      signalHost: {
        on: (signal, handler) => listeners.set(signal, handler),
        off: (signal, handler) => {
          if (listeners.get(signal) === handler) listeners.delete(signal)
        },
      },
      exit: code => {
        exitCode = code
      },
      timeoutMs: 100,
    })

    listeners.get("SIGTERM")?.()

    expect(await proc.exited).not.toBeNull()
    for (
      let attempt = 0;
      attempt < 20 && exitCode === undefined;
      attempt += 1
    ) {
      await Bun.sleep(10)
    }
    expect(exitCode).toBe(143)
    expect(listeners.has("SIGTERM")).toBe(false)
    dispose()
  })
})
