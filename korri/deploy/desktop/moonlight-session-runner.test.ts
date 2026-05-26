import { describe, expect, it } from "bun:test"
import { createDesktopMoonlightSessionRunner } from "./moonlight-session-runner"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(innerResolve => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

type ControlledChild = ReturnType<typeof createControlledChild>

function createControlledChild(pid: number) {
  const exit = deferred<number>()
  const signals: string[] = []
  return {
    pid,
    stdout: undefined,
    stderr: undefined,
    exited: exit.promise,
    unrefCalled: false,
    signals,
    unref() {
      this.unrefCalled = true
    },
    kill(signal: string) {
      signals.push(signal)
    },
    exit,
  }
}

describe("desktop Moonlight session runner", () => {
  it("returns an observable managed handle for a started child", async () => {
    const child = createControlledChild(4242)
    const sessionRunner = createDesktopMoonlightSessionRunner({
      spawn: () => child,
      collectOutput: false,
    })

    const result = await sessionRunner.run("moonlight", ["stream"], {
      startupObserveMs: 0,
    })

    expect(result.status).toBe("started")
    if (result.status === "started") {
      expect(result.session?.id).toBe("pid-4242")
      expect(result.session?.processId).toBe(4242)
      expect(child.unrefCalled).toBe(true)

      child.exit.resolve(0)
      await expect(result.session?.exited).resolves.toEqual({ exitCode: 0 })
    }
  })

  it("does not terminate an existing child when another launch starts", async () => {
    const children: ControlledChild[] = []
    const sessionRunner = createDesktopMoonlightSessionRunner({
      spawn: () => {
        const child = createControlledChild(5000 + children.length)
        children.push(child)
        return child
      },
      collectOutput: false,
    })

    await sessionRunner.run("moonlight", ["stream", "first"], {
      startupObserveMs: 0,
    })
    await sessionRunner.run("moonlight", ["stream", "second"], {
      startupObserveMs: 0,
    })

    expect(children).toHaveLength(2)
    expect(children[0]?.signals).toEqual([])
    expect(children[1]?.signals).toEqual([])
  })

  it("terminates only through the returned managed handle", async () => {
    const first = createControlledChild(6101)
    const second = createControlledChild(6102)
    const children = [first, second]
    const sessionRunner = createDesktopMoonlightSessionRunner({
      spawn: () => children.shift() ?? createControlledChild(9999),
      collectOutput: false,
    })

    const firstResult = await sessionRunner.run("moonlight", ["stream"], {
      startupObserveMs: 0,
    })
    const secondResult = await sessionRunner.run("moonlight", ["stream"], {
      startupObserveMs: 0,
    })

    if (firstResult.status !== "started" || secondResult.status !== "started") {
      throw new Error("expected both children to start")
    }

    secondResult.session?.terminate()

    expect(first.signals).toEqual([])
    expect(second.signals).toEqual(["SIGTERM"])
  })

  it("keeps early non-zero startup exits as launch failures", async () => {
    const child = createControlledChild(7001)
    child.exit.resolve(42)
    const sessionRunner = createDesktopMoonlightSessionRunner({
      spawn: () => child,
      collectOutput: false,
    })

    const result = await sessionRunner.run("moonlight", ["stream"], {
      startupObserveMs: 10,
    })

    expect(result).toEqual({
      status: "failed",
      message: "Moonlight exited early with status 42",
    })
  })
})
