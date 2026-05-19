import { describe, expect, it } from "bun:test"
import {
  beginGameStreamStart,
  beginGameStreamStopping,
  canStartGameStream,
  completeGameStreamExit,
  failGameStream,
  initialGameStreamState,
  markGameStreamFullscreenRepaired,
  markGameStreamRunning,
} from "./game-stream-state"

describe("game stream state", () => {
  it("moves through start, running, fullscreen, and exited states", () => {
    const starting = beginGameStreamStart(initialGameStreamState, "run-1")
    const running = markGameStreamRunning(starting, 123)
    const fullscreen = markGameStreamFullscreenRepaired(running)
    const exited = completeGameStreamExit(fullscreen, 0)

    expect(starting).toEqual({ mode: "starting", runId: "run-1" })
    expect(running).toMatchObject({ mode: "running", childPid: 123 })
    expect(exited).toEqual({
      mode: "exited",
      runId: "run-1",
      exitCode: 0,
      childPid: undefined,
      fullscreenRepaired: true,
    })
    expect(canStartGameStream(exited)).toBe(true)
  })

  it("does not start another run while already running", () => {
    const running = markGameStreamRunning(
      beginGameStreamStart(initialGameStreamState, "run-1"),
      123,
    )

    expect(canStartGameStream(running)).toBe(false)
    expect(beginGameStreamStart(running, "run-2")).toBe(running)
  })

  it("records failure stage and stays rerunnable", () => {
    const failed = failGameStream(
      beginGameStreamStart(initialGameStreamState, "run-1"),
      { stage: "spawn", reason: "missing command", exitCode: 127 },
    )

    expect(failed).toEqual({
      mode: "failed",
      runId: "run-1",
      childPid: undefined,
      exitCode: 127,
      failureStage: "spawn",
      failureReason: "missing command",
      fullscreenRepaired: undefined,
    })
    expect(canStartGameStream(failed)).toBe(true)
  })

  it("marks active runs as stopping", () => {
    const running = markGameStreamRunning(
      beginGameStreamStart(initialGameStreamState, "run-1"),
      123,
    )

    expect(beginGameStreamStopping(running)).toMatchObject({
      mode: "stopping",
      childPid: 123,
    })
  })
})
