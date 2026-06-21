import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "./discover-devices"
import { resolveInputPlumberVirtualGamepad } from "./inputplumber-virtual-gamepad"

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf8")
}

async function resolveFixture(
  name: string,
  options?: Parameters<typeof resolveInputPlumberVirtualGamepad>[1],
) {
  const devices = parseProcBusInputDevices(await loadFixture(name))
  return resolveInputPlumberVirtualGamepad(devices, options)
}

describe("resolveInputPlumberVirtualGamepad", () => {
  it("selects the InputPlumber virtual controller instead of raw hardware", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-virtual.txt",
    )

    expect(result).toMatchObject({
      status: "found",
      path: "/dev/input/event10",
      device: {
        deviceId: "inputplumber-virtual-xbox360",
        class: "gamepad",
        name: "Microsoft X-Box 360 pad",
        eventNode: "event10",
        physicalPath: "inputplumber/virtual-xbox360",
        uniqueId: "inputplumber-virtual-xbox360",
      },
    })
  })

  it("selects virtual Xbox Series targets emitted by InputPlumber without phys or uniq metadata", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-xbox-series-virtual.txt",
    )

    expect(result).toMatchObject({
      status: "found",
      path: "/dev/input/event10",
      device: {
        deviceId: "event10",
        name: "Microsoft Xbox Series S|X Controller",
        sysfsPath: "/devices/virtual/input/input11",
      },
    })
  })

  it("does not mistake a physical Xbox controller for an InputPlumber virtual target", async () => {
    const result = await resolveFixture("bus-input-devices-raw-xbox-series.txt")

    expect(result).toMatchObject({ status: "missing", rawGamepads: 1 })
  })

  it("does not select raw gamepads when no normalized virtual controller exists", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-raw-only.txt",
    )

    expect(result).toMatchObject({ status: "missing", rawGamepads: 1 })
  })

  it("fails as ambiguous when multiple InputPlumber virtual gamepads exist", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-ambiguous.txt",
    )

    expect(result.status).toBe("ambiguous")
    if (result.status === "ambiguous") {
      expect(result.devices.map(device => device.eventNode)).toEqual([
        "event10",
        "event11",
      ])
    }
  })

  it("selects a preferred InputPlumber virtual target from an otherwise ambiguous topology", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-ambiguous.txt",
      { preferredNames: ["Microsoft Xbox Series S|X Controller"] },
    )

    expect(result).toMatchObject({
      status: "found",
      path: "/dev/input/event11",
      device: {
        name: "Microsoft Xbox Series S|X Controller",
        eventNode: "event11",
      },
    })
  })

  it("keeps preferred matching fail-closed when the preference is missing or still ambiguous", async () => {
    const missing = await resolveFixture(
      "bus-input-devices-inputplumber-ambiguous.txt",
      { preferredNames: ["Nintendo Switch Pro Controller"] },
    )
    expect(missing.status).toBe("missing")

    const stillAmbiguous = await resolveFixture(
      "bus-input-devices-inputplumber-ambiguous.txt",
      {
        preferredEventNodes: ["event10", "event11"],
      },
    )
    expect(stillAmbiguous.status).toBe("ambiguous")
  })

  it("returns the current event node when event numbering changes", async () => {
    const result = await resolveFixture(
      "bus-input-devices-inputplumber-renumbered.txt",
    )

    expect(result).toMatchObject({
      status: "found",
      path: "/dev/input/event14",
      device: { eventNode: "event14" },
    })
  })

  it("handles malformed or empty proc content without accepting raw devices", async () => {
    const malformed = await resolveFixture(
      "bus-input-devices-inputplumber-malformed.txt",
    )
    expect(malformed.status).toBe("missing")

    const empty = resolveInputPlumberVirtualGamepad(
      parseProcBusInputDevices(""),
    )
    expect(empty).toEqual({ status: "missing", rawGamepads: 0 })
  })
})
