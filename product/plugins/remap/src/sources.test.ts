import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "@platform/input/native/discover-devices"
import { resolveRemapControllerSources } from "./sources"

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

async function loadDevices(name: string) {
  return parseProcBusInputDevices(
    await readFile(join(FIXTURES_DIR, name), "utf8"),
  )
}

describe("Remap controller sources", () => {
  it("defaults p1 when exactly one InputPlumber virtual gamepad exists", async () => {
    const result = resolveRemapControllerSources(
      await loadDevices("bus-input-devices-inputplumber-virtual.txt"),
    )

    expect(result).toMatchObject({
      status: "resolved",
      controllers: {
        p1: { path: "/dev/input/event10", device: { eventNode: "event10" } },
      },
    })
  })

  it("resolves multiple configured slots by normalized preferred names", async () => {
    const result = resolveRemapControllerSources(
      await loadDevices("bus-input-devices-inputplumber-ambiguous.txt"),
      {
        p1: {
          source: "inputplumber-virtual-gamepad",
          prefer: { name: "microsoft-x-box-360-pad" },
        },
        p2: {
          source: "inputplumber-virtual-gamepad",
          prefer: { name: "microsoft-xbox-series-s-x-controller" },
        },
      },
    )

    expect(result).toMatchObject({ status: "resolved" })
    if (result.status === "resolved") {
      expect(result.controllers.p1?.device.eventNode).toBe("event10")
      expect(result.controllers.p2?.device.eventNode).toBe("event11")
    }
  })

  it("fails closed rather than selecting raw devices or ambiguous virtual devices", async () => {
    const rawOnly = resolveRemapControllerSources(
      await loadDevices("bus-input-devices-inputplumber-raw-only.txt"),
    )
    expect(rawOnly).toMatchObject({ status: "failed", reason: "missing" })

    const ambiguous = resolveRemapControllerSources(
      await loadDevices("bus-input-devices-inputplumber-ambiguous.txt"),
    )
    expect(ambiguous).toMatchObject({ status: "failed", reason: "ambiguous" })
  })

  it("fails when a preferred controller is missing or two slots select the same node", async () => {
    const devices = await loadDevices(
      "bus-input-devices-inputplumber-ambiguous.txt",
    )

    expect(
      resolveRemapControllerSources(devices, {
        p1: {
          source: "inputplumber-virtual-gamepad",
          prefer: { name: "nintendo-switch-pro-controller" },
        },
      }),
    ).toMatchObject({ status: "failed", reason: "missing", player: "p1" })

    expect(
      resolveRemapControllerSources(devices, {
        p1: {
          source: "inputplumber-virtual-gamepad",
          prefer: { name: "microsoft-xbox-series-s-x-controller" },
        },
        p2: {
          source: "inputplumber-virtual-gamepad",
          prefer: { name: "microsoft-xbox-series-s-x-controller" },
        },
      }),
    ).toMatchObject({ status: "failed", reason: "duplicate", player: "p2" })
  })
})
