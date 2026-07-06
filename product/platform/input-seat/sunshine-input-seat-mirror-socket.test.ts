import { describe, expect, it } from "bun:test"
import { mkdtemp, stat } from "node:fs/promises"
import { createConnection } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSunshineRemoteInputSourceAdapter } from "./sunshine-remote-input-source"
import {
  createSunshineInputSeatMirrorFrameSink,
  startSunshineInputSeatMirrorSocket,
  type SunshineInputSeatMirrorDiagnostic,
} from "./sunshine-input-seat-mirror-socket"

const stateFrame = (
  input: { readonly launchId?: string; readonly buttons?: number } = {},
) => ({
  kind: "source-state",
  launchId: input.launchId ?? "launch-1",
  controllerNumber: 0,
  buttons: input.buttons ?? 1,
  leftTrigger: 0,
  rightTrigger: 0,
  leftStickX: 0,
  leftStickY: 0,
  rightStickX: 0,
  rightStickY: 0,
})

const connectedFrame = (launchId = "launch-1") => ({
  kind: "source-connected",
  launchId,
  controllerNumber: 0,
})

const disconnectedFrame = () => ({
  kind: "source-disconnected",
  launchId: "launch-1",
  controllerNumber: 0,
  reason: "stream-disconnected",
})

const line = (frame: unknown): string => `${JSON.stringify(frame)}\n`

const writeFrame = (socketPath: string, frame: unknown): Promise<void> =>
  new Promise((resolve, reject) => {
    const client = createConnection(socketPath)
    client.once("error", reject)
    client.once("connect", () => {
      client.end(line(frame), resolve)
    })
  })

describe("Sunshine input-seat mirror socket", () => {
  it("feeds chunked newline-delimited mirror frames into the launch-scoped adapter", () => {
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
    })
    const sink = createSunshineInputSeatMirrorFrameSink({
      adapter,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })
    const first = line(connectedFrame())
    const second = line(disconnectedFrame())

    sink.push(first.slice(0, 8))
    sink.push(first.slice(8) + second)

    expect(adapter.seats()[0]).toMatchObject({
      tag: "occupied-disconnected-reserved",
      slot: 1,
      reason: "stream-disconnected",
    })
    expect(
      diagnostics.filter(diagnostic => diagnostic.kind === "frame-accepted"),
    ).toHaveLength(2)
  })

  it("drops stale launch frames without claiming a seat", () => {
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
    })
    const sink = createSunshineInputSeatMirrorFrameSink({
      adapter,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    sink.push(line(connectedFrame("stale-launch")))

    expect(adapter.seats()).toEqual([{ tag: "available", slot: 1 }])
    expect(diagnostics).toContainEqual({
      kind: "frame-accepted",
      result: { status: "dropped", reason: "stale-launch" },
    })
  })

  it("rejects malformed, non-gamepad, and oversized frames at the socket seam", () => {
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 10,
    })
    const sink = createSunshineInputSeatMirrorFrameSink({
      adapter,
      maxFrameBytes: 64,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    sink.push("{not-json}\n")
    sink.push(line({ kind: "source-keyboard", launchId: "launch-1" }))
    sink.push(
      `${JSON.stringify({ ...connectedFrame(), padding: "x".repeat(100) })}\n`,
    )

    expect(diagnostics.map(diagnostic => diagnostic.kind)).toEqual([
      "frame-json-invalid",
      "frame-schema-invalid",
      "frame-too-large",
    ])
    expect(adapter.seats()).toEqual([{ tag: "available", slot: 1 }])
  })

  it("applies adapter rate limiting to socket-fed state frames", () => {
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    const adapter = createSunshineRemoteInputSourceAdapter({
      launchId: "launch-1",
      seatCount: 1,
      maxEventsPerSecond: 1,
      nowMs: () => 0,
    })
    const sink = createSunshineInputSeatMirrorFrameSink({
      adapter,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    sink.push(line(connectedFrame()))
    sink.push(line(stateFrame({ buttons: 1 })))
    sink.push(line(stateFrame({ buttons: 2 })))

    expect(adapter.forwardedEvents()).toHaveLength(1)
    expect(diagnostics).toContainEqual({
      kind: "frame-accepted",
      result: { status: "dropped", reason: "rate-limited" },
    })
  })

  it("starts a 0600 Unix socket and accepts mirror frames", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sunshine-input-seat-"))
    const socketPath = join(dir, "mirror.sock")
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    const handle = await startSunshineInputSeatMirrorSocket({
      launchId: "launch-1",
      socketPath,
      seatCount: 1,
      maxEventsPerSecond: 10,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    try {
      expect((await stat(socketPath)).mode & 0o777).toBe(0o600)
      const accepted = new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (
            diagnostics.some(diagnostic => diagnostic.kind === "frame-accepted")
          ) {
            clearInterval(interval)
            resolve()
          }
        }, 1)
      })
      const client = createConnection(socketPath)
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve)
        client.once("error", reject)
      })
      client.write(line(connectedFrame()))
      client.end()
      await accepted

      expect(handle.adapter.seats()[0]).toMatchObject({
        tag: "occupied-connected",
        slot: 1,
      })
    } finally {
      await handle.stop()
    }
  })

  it("bounds socket-wide writer backlog when the seat writer stalls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sunshine-input-seat-"))
    const socketPath = join(dir, "mirror.sock")
    const diagnostics: SunshineInputSeatMirrorDiagnostic[] = []
    let resolveFirstWrite: (() => void) | undefined
    const firstWrite = new Promise<void>(resolve => {
      resolveFirstWrite = resolve
    })
    const handle = await startSunshineInputSeatMirrorSocket({
      launchId: "launch-1",
      socketPath,
      seatCount: 1,
      maxEventsPerSecond: 10,
      maxPendingGamepadWrites: 1,
      onGamepadState: () => firstWrite,
      onDiagnostic: diagnostic => diagnostics.push(diagnostic),
    })

    try {
      await writeFrame(socketPath, connectedFrame())
      await writeFrame(socketPath, stateFrame({ buttons: 1 }))
      await writeFrame(socketPath, stateFrame({ buttons: 2 }))
      await writeFrame(socketPath, stateFrame({ buttons: 3 }))
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(diagnostics).toContainEqual({
        kind: "frame-forward-dropped",
        reason: "queue-full",
      })
      resolveFirstWrite?.()
    } finally {
      await handle.stop()
    }
  })

  it("drops pending queued state after the source leaves the seat", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sunshine-input-seat-"))
    const socketPath = join(dir, "mirror.sock")
    let resolveFirstWrite: (() => void) | undefined
    const firstWrite = new Promise<void>(resolve => {
      resolveFirstWrite = resolve
    })
    const writes: number[] = []
    const handle = await startSunshineInputSeatMirrorSocket({
      launchId: "launch-1",
      socketPath,
      seatCount: 1,
      maxEventsPerSecond: 10,
      maxPendingGamepadWrites: 4,
      onGamepadState: async state => {
        writes.push(state.frame.buttons)
        if (state.frame.buttons === 1) await firstWrite
      },
    })

    try {
      await writeFrame(socketPath, connectedFrame())
      await writeFrame(socketPath, stateFrame({ buttons: 1 }))
      await writeFrame(socketPath, stateFrame({ buttons: 2 }))
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(writes).toEqual([1])

      handle.adapter.leaveSeat(1)
      resolveFirstWrite?.()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(writes).toEqual([1])
    } finally {
      await handle.stop()
    }
  })

  it("requires an absolute socket path", async () => {
    await expect(
      startSunshineInputSeatMirrorSocket({
        launchId: "launch-1",
        socketPath: "relative.sock",
        seatCount: 1,
        maxEventsPerSecond: 10,
      }),
    ).rejects.toThrow("must be absolute")
  })
})
