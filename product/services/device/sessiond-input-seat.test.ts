import { access, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises"
import { createConnection } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import { INPUT_SEAT_PROVIDER_ID } from "@platform/input-seat/policy"
import {
  createMemorySeatRuntime,
  type InputSeatGamepadState,
  type SeatRuntimeWriter,
} from "@platform/input-seat/seat-runtime-port"
import { createSessiondInputSeatPreSpawnGate } from "./sessiond-input-seat"

describe("sessiond input-seat gate", () => {
  it("allocates the resolved P1-P4 seat pool before spawn and releases on stop", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    const handle = await gate.start({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: [] },
      signal: new AbortController().signal,
      launchCompanions: {
        [INPUT_SEAT_PROVIDER_ID]: { runtimeSupportsExtraSeats: true },
      },
    })

    expect(runtime.createdSlots()).toEqual([1, 2, 3, 4])
    await handle?.stop()
    expect(runtime.releasedSlots()).toEqual([1, 2, 3, 4])
  })

  it("honors opt-down policy", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await gate.start({
      launchId: "launch-1",
      spec: { command: "/bin/game", args: [] },
      signal: new AbortController().signal,
      launchCompanions: {
        [INPUT_SEAT_PROVIDER_ID]: { playerCount: 2 },
      },
    })

    expect(runtime.createdSlots()).toEqual([1, 2])
  })

  it("skips allocation when policy is absent or disabled", async () => {
    const runtime = createMemorySeatRuntime()
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    expect(
      await gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
      }),
    ).toBeUndefined()
    expect(
      await gate.start({
        launchId: "launch-2",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 0 },
        },
      }),
    ).toBeUndefined()
    expect(runtime.createdSlots()).toEqual([])
  })

  it("maps ambiguous runtime allocation to input-ambiguous", async () => {
    const runtime = createMemorySeatRuntime({ duplicateName: "Korri Seat P1" })
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await expect(
      gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 1 },
        },
      }),
    ).rejects.toMatchObject({ failureKind: "input-ambiguous" })
  })

  it("maps unavailable runtime allocation to input-unavailable", async () => {
    const runtime = createMemorySeatRuntime({ failAtSlot: 2 })
    const gate = createSessiondInputSeatPreSpawnGate({
      runtime,
      timeoutMs: 100,
    })

    await expect(
      gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 2 },
        },
      }),
    ).rejects.toMatchObject({ failureKind: "input-unavailable" })
    expect(runtime.releasedSlots()).toEqual([1])
  })

  it("starts a Sunshine mirror socket that writes accepted state frames into active seats", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-input-seat-"))
    const socketPath = join(dir, "mirror.sock")
    const sidecarPath = join(dir, "active-launch.json")
    const writes: Array<{ slot: number; state: InputSeatGamepadState }> = []
    const runtime = Object.assign(createMemorySeatRuntime(), {
      writeGamepadState: async (slot: number, state: InputSeatGamepadState) => {
        writes.push({ slot, state })
      },
    } satisfies SeatRuntimeWriter)

    try {
      const gate = createSessiondInputSeatPreSpawnGate({
        runtime,
        timeoutMs: 100,
        sunshineMirror: {
          socketPath,
          activeLaunchSidecarPath: sidecarPath,
          mirrorTokenFactory: () => "test-token",
          maxEventsPerSecond: 60,
        },
      })

      const handle = await gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 1 },
        },
      })

      expect(handle?.sourceEnv).toBeUndefined()
      expect((await stat(sidecarPath)).mode & 0o777).toBe(0o600)
      expect(JSON.parse(await readFile(sidecarPath, "utf8"))).toEqual({
        launchId: "launch-1",
        generation: 1,
        mirrorToken: "test-token",
      })

      await writeSocketFrame(socketPath, {
        mirrorToken: "bad-token",
        frame: {
          kind: "source-connected",
          launchId: "launch-1",
          controllerNumber: 0,
        },
      })
      await writeSocketFrame(socketPath, {
        mirrorToken: "test-token",
        frame: {
          kind: "source-connected",
          launchId: "launch-1",
          controllerNumber: 0,
        },
      })
      await writeSocketFrame(socketPath, {
        mirrorToken: "test-token",
        frame: {
          kind: "source-state",
          launchId: "launch-1",
          controllerNumber: 0,
          buttons: 7,
          leftTrigger: 1,
          rightTrigger: 2,
          leftStickX: -3,
          leftStickY: 4,
          rightStickX: -5,
          rightStickY: 6,
        },
      })
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(writes).toEqual([
        {
          slot: 1,
          state: {
            buttons: 7,
            leftTrigger: 1,
            rightTrigger: 2,
            leftStickX: -3,
            leftStickY: 4,
            rightStickX: -5,
            rightStickY: 6,
          },
        },
      ])

      handle?.leaveInputSeat?.(1)
      await writeSocketFrame(socketPath, {
        mirrorToken: "test-token",
        frame: {
          kind: "source-state",
          launchId: "launch-1",
          controllerNumber: 0,
          buttons: 8,
          leftTrigger: 0,
          rightTrigger: 0,
          leftStickX: 0,
          leftStickY: 0,
          rightStickX: 0,
          rightStickY: 0,
        },
      })
      await writeSocketFrame(socketPath, {
        mirrorToken: "test-token",
        frame: {
          kind: "source-connected",
          launchId: "launch-1",
          controllerNumber: 1,
        },
      })
      await writeSocketFrame(socketPath, {
        mirrorToken: "test-token",
        frame: {
          kind: "source-state",
          launchId: "launch-1",
          controllerNumber: 1,
          buttons: 9,
          leftTrigger: 0,
          rightTrigger: 0,
          leftStickX: 0,
          leftStickY: 0,
          rightStickX: 0,
          rightStickY: 0,
        },
      })
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(writes.map(write => write.state.buttons)).toEqual([7, 9])

      await handle?.stop()
      await expect(access(sidecarPath)).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("releases seats even when mirror sidecar cleanup fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-sessiond-input-seat-"))
    const socketPath = join(dir, "mirror.sock")
    const sidecarPath = join(dir, "active-launch.json")
    const runtime = Object.assign(createMemorySeatRuntime(), {
      writeGamepadState: () => {},
    } satisfies SeatRuntimeWriter)

    try {
      const gate = createSessiondInputSeatPreSpawnGate({
        runtime,
        timeoutMs: 100,
        sunshineMirror: {
          socketPath,
          activeLaunchSidecarPath: sidecarPath,
          mirrorTokenFactory: () => "test-token",
        },
      })

      const handle = await gate.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          [INPUT_SEAT_PROVIDER_ID]: { playerCount: 1 },
        },
      })

      await rm(sidecarPath)
      await symlink(join(dir, "target"), sidecarPath)
      await expect(handle?.stop()).rejects.toThrow(/symlink/)
      expect(runtime.releasedSlots()).toEqual([1])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

const writeSocketFrame = (
  socketPath: string,
  frame: Record<string, unknown>,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const client = createConnection(socketPath)
    client.once("error", reject)
    client.once("connect", () => {
      client.end(`${JSON.stringify(frame)}\n`, resolve)
    })
  })
