import { describe, expect, it } from "bun:test"
import { waitForYfsReady } from "./diagnostics"

class SequenceCdp {
  private index = 0
  constructor(private readonly states: unknown[]) {}
  async evaluate<T>(): Promise<T> {
    const state = this.states[Math.min(this.index, this.states.length - 1)]
    this.index += 1
    return state as T
  }
  async send(): Promise<unknown> {
    return {}
  }
  close(): void {}
}

describe("YFS launch diagnostics", () => {
  it("returns ready loader state", async () => {
    await expect(
      waitForYfsReady(new SequenceCdp([{ status: "ready", attempts: 3 }]), {
        timeoutMs: 20,
        pollMs: 1,
      }),
    ).resolves.toMatchObject({ status: "ready", attempts: 3 })
  })

  it("fails immediately when the loader reports failed", async () => {
    await expect(
      waitForYfsReady(
        new SequenceCdp([{ status: "failed", lastError: "bad level" }]),
        { timeoutMs: 20, pollMs: 1 },
      ),
    ).rejects.toThrow("bad level")
  })

  it("times out with the last observed waiting state", async () => {
    await expect(
      waitForYfsReady(
        new SequenceCdp([{ status: "waiting-for-gameplay", attempts: 4 }]),
        { timeoutMs: 5, pollMs: 1 },
      ),
    ).rejects.toThrow("waiting-for-gameplay")
  })
})
