import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import type { DiscoveredDevice } from "@platform/input/native/discover-devices"
import { inputSeatNameForSlot } from "./device-identity"
import { makeRequestedSeat } from "./seat-runtime-port"
import {
  createNdjsonHelperTransport,
  createUinputSeatBackend,
  type UinputSeatBackendCommand,
  type UinputSeatBackendTransport,
} from "./uinput-seat-backend"

const gamepadDevice = (slot: number): DiscoveredDevice => ({
  deviceId: `korri-seat-p${slot}`,
  class: "gamepad",
  name: inputSeatNameForSlot(slot),
  eventNode: `event${slot}`,
  capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
  physicalPath: `korri/input-seat/p${slot}`,
  uniqueId: `korri-seat-p${slot}`,
})

describe("uinput seat backend", () => {
  it("creates deterministic Korri seat identities through the helper", async () => {
    const transport = createRecordingTransport()
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport,
      discoverDevices: () => [gamepadDevice(1)],
    })

    const handle = await backend.createSeat(makeRequestedSeat(1))

    expect(handle).toEqual({
      slot: 1,
      token: "helper-seat-1",
      expectedPhysicalPath: "korri/input-seat/p1",
      expectedUniqueId: null,
    })
    expect(transport.commands[0]).toEqual({
      op: "create",
      slot: 1,
      name: "Korri Seat P1",
      phys: "korri/input-seat/p1",
      uniq: "korri-seat-p1",
    })
    expect(await backend.discoverDevices()).toEqual([gamepadDevice(1)])
  })

  it("writes bounded gamepad state and releases seats through the helper", async () => {
    const transport = createRecordingTransport()
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport,
      discoverDevices: () => [gamepadDevice(1)],
    })
    const handle = await backend.createSeat(makeRequestedSeat(1))

    await backend.writeGamepadState(handle, {
      buttons: 0x1000,
      leftTrigger: 255,
      rightTrigger: 1,
      leftStickX: -32768,
      leftStickY: 32767,
      rightStickX: 0,
      rightStickY: 42,
    })
    await backend.releaseSeat(handle)

    expect(transport.commands.slice(1)).toEqual([
      {
        op: "state",
        token: "helper-seat-1",
        slot: 1,
        state: {
          buttons: 0x1000,
          leftTrigger: 255,
          rightTrigger: 1,
          leftStickX: -32768,
          leftStickY: 32767,
          rightStickX: 0,
          rightStickY: 42,
        },
      },
      { op: "release", token: "helper-seat-1", slot: 1 },
    ])
  })

  it("accepts only Nix-store helpers or the fixed privileged NixOS wrapper", () => {
    expect(() =>
      createUinputSeatBackend({
        helperPath: "/run/wrappers/bin/korri-uinput-seat-helper",
        transport: createRecordingTransport(),
      }),
    ).not.toThrow()

    for (const helperPath of [
      "korri-uinput-seat-helper",
      "%t/korri-uinput-seat-helper",
      "/usr/bin/korri-uinput-seat-helper",
      "/run/wrappers/bin/not-korri-uinput-seat-helper",
    ]) {
      expect(() => createUinputSeatBackend({ helperPath })).toThrow(
        /helper path/,
      )
    }
  })

  it("stops the helper transport after shutdown", async () => {
    const transport = createRecordingTransport()
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport,
      discoverDevices: () => [],
    })

    await backend.shutdown()

    expect(transport.stopped).toBe(true)
  })

  it("drives the real NDJSON helper transport", async () => {
    const transport = createNdjsonHelperTransport([
      process.execPath,
      "-e",
      ndjsonHelperFixture,
    ])
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport,
      discoverDevices: () => [gamepadDevice(1)],
    })

    const handle = await backend.createSeat(makeRequestedSeat(1))
    await backend.writeGamepadState(handle, {
      buttons: 0x1000,
      leftTrigger: 0,
      rightTrigger: 0,
      leftStickX: 0,
      leftStickY: 0,
      rightStickX: 0,
      rightStickY: 0,
    })
    await backend.releaseSeat(handle)
    await backend.shutdown()

    expect(handle.token).toBe("korri-seat-p1")
  })

  it("checks read permission rather than only event-node existence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-uinput-readable-"))
    const path = join(dir, "event1")
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport: createRecordingTransport(),
      discoverDevices: () => [],
    })
    try {
      await writeFile(path, "")
      await chmod(path, 0o000)
      expect(await backend.isDeviceReadable?.(path)).toBe(false)
      await chmod(path, 0o600)
      expect(await backend.isDeviceReadable?.(path)).toBe(true)
    } finally {
      await chmod(path, 0o600).catch(() => {})
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("redacts helper failures before allocation errors reach sessiond", async () => {
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      transport: {
        request: async () => ({ ok: false, error: "uinput open failed" }),
      },
      discoverDevices: () => [],
    })

    await expect(backend.createSeat(makeRequestedSeat(1))).rejects.toThrow(
      /input-seat uinput backend unavailable/,
    )
  })

  it("times out a stuck helper request and stops the transport", async () => {
    let stopped = false
    const backend = createUinputSeatBackend({
      helperPath:
        "/nix/store/test-korri-uinput-seat-helper/bin/korri-uinput-seat-helper",
      helperRequestTimeoutMs: 1,
      transport: {
        request: async () => await new Promise(() => {}),
        stop: () => {
          stopped = true
        },
      },
      discoverDevices: () => [],
    })

    await expect(backend.createSeat(makeRequestedSeat(1))).rejects.toThrow(
      /input-seat uinput backend unavailable/,
    )
    expect(stopped).toBe(true)
  })
})

const ndjsonHelperFixture = `
const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const command = JSON.parse(line);
    const response = command.op === "create"
      ? { id: command.id, ok: true, token: \`korri-seat-p\${command.slot}\` }
      : { id: command.id, ok: true };
    process.stdout.write(JSON.stringify(response) + "\\n");
  }
}
`

const createRecordingTransport = (): UinputSeatBackendTransport & {
  readonly commands: UinputSeatBackendCommand[]
  stopped: boolean
} => {
  const commands: UinputSeatBackendCommand[] = []
  return {
    commands,
    stopped: false,
    request: async command => {
      commands.push(command)
      if (command.op === "create") {
        return { ok: true, token: `helper-seat-${command.slot}` }
      }
      return { ok: true }
    },
    stop: async function (this: { stopped: boolean }) {
      this.stopped = true
    },
  }
}
