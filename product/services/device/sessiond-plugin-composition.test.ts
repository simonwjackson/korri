import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import type { DiscoveredDevice } from "@platform/input/native/discover-devices"
import { inputSeatNameForSlot } from "@platform/input-seat/device-identity"
import type { UinputSeatBackend } from "@platform/input-seat/uinput-seat-runtime"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_STEAM_PLUGIN_ID } from "@product/plugins/steam"
import {
  sessiondPreSpawnGatesFromEnv,
  sessionLifecycleHooksFromEnv,
} from "./sessiond-plugin-composition"

describe("sessiond plugin composition", () => {
  it("installs lifecycle hooks for enabled first-party plugins", () => {
    expect(sessionLifecycleHooksFromEnv({})).toEqual([])

    const hooks = sessionLifecycleHooksFromEnv({
      KORRI_ENABLED_PLUGINS: `${KORRI_GAMESCOPE_PLUGIN_ID},${KORRI_STEAM_PLUGIN_ID}`,
      KORRI_GAMESCOPE_CONTROL_BRIDGE: "0",
    })

    expect(hooks.map(hook => hook.id)).toEqual([
      KORRI_GAMESCOPE_PLUGIN_ID,
      KORRI_STEAM_PLUGIN_ID,
    ])
  })

  it("installs the input-seat pre-spawn gate regardless of enabled plugins", () => {
    expect(sessiondPreSpawnGatesFromEnv({}).map(gate => gate.id)).toEqual([
      "@korri:input-seat",
    ])
    expect(
      sessiondPreSpawnGatesFromEnv({ KORRI_ENABLED_PLUGINS: "" }).map(
        gate => gate.id,
      ),
    ).toEqual(["@korri:input-seat"])
  })

  it("uses a writable input-seat runtime and stable Sunshine mirror paths when runtime dir is configured", async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), "korri-input-seat-runtime-"))
    const backend = createReadySeatBackend()
    const gates = sessiondPreSpawnGatesFromEnv(
      { KORRI_INPUT_SEAT_RUNTIME_DIR: runtimeDir },
      { createSeatBackend: () => backend },
    )

    try {
      const handle = await gates[0]?.start({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        signal: new AbortController().signal,
        launchCompanions: {
          "@korri:input-seat": { playerCount: 1 },
        },
      })

      expect(handle?.inputSeats?.seats.map(seat => seat.name)).toEqual([
        "Korri Seat P1",
      ])
      expect(backend.created).toEqual([1])
      expect(backend.released).toEqual([])
      await handle?.stop()
      expect(backend.released).toEqual([1])
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it("fails input-seat launches closed when runtime dir has no production helper", async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), "korri-input-seat-runtime-"))
    try {
      for (const helperPath of [undefined, "/usr/bin/korri-uinput-seat-helper"]) {
        const [gate] = sessiondPreSpawnGatesFromEnv({
          KORRI_INPUT_SEAT_RUNTIME_DIR: runtimeDir,
          ...(helperPath ? { KORRI_INPUT_SEAT_BACKEND_HELPER: helperPath } : {}),
        })

        await expect(
          gate?.start({
            launchId: "launch-1",
            spec: { command: "/bin/game", args: [] },
            signal: new AbortController().signal,
            launchCompanions: {
              "@korri:input-seat": { playerCount: 1 },
            },
          }),
        ).rejects.toMatchObject({ failureKind: "input-unavailable" })
      }
    } finally {
      await rm(runtimeDir, { recursive: true, force: true })
    }
  })

  it("fails input-seat launches closed when runtime dir is relative or unresolved", async () => {
    for (const value of ["relative/input-seat", "%t/korri/input-seat"]) {
      const [gate] = sessiondPreSpawnGatesFromEnv({
        KORRI_INPUT_SEAT_RUNTIME_DIR: value,
      })

      await expect(
        gate?.start({
          launchId: "launch-1",
          spec: { command: "/bin/game", args: [] },
          signal: new AbortController().signal,
          launchCompanions: {
            "@korri:input-seat": { playerCount: 1 },
          },
        }),
      ).rejects.toMatchObject({ failureKind: "input-unavailable" })
    }
  })
})

const createReadySeatBackend = (): UinputSeatBackend & {
  readonly created: number[]
  readonly released: number[]
} => {
  const created: number[] = []
  const released: number[] = []
  const devices = new Map<number, DiscoveredDevice>()
  return {
    created,
    released,
    createSeat: async seat => {
      created.push(seat.slot)
      devices.set(seat.slot, gamepadDevice(seat.slot))
      return { slot: seat.slot, token: `seat-${seat.slot}` }
    },
    releaseSeat: async handle => {
      released.push(handle.slot)
      devices.delete(handle.slot)
    },
    discoverDevices: () => Array.from(devices.values()),
    writeGamepadState: () => {},
    isDeviceReadable: () => true,
  }
}

const gamepadDevice = (slot: number): DiscoveredDevice => ({
  deviceId: `korri-seat-p${slot}`,
  class: "gamepad",
  name: inputSeatNameForSlot(slot),
  eventNode: `event${slot}`,
  capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
  physicalPath: `korri/input-seat/p${slot}`,
  uniqueId: `korri-seat-p${slot}`,
})
