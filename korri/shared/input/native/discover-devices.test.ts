import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseProcBusInputDevices } from "./discover-devices"

const FIXTURES_DIR = join(process.cwd(), "tools/testing/fixtures/proc")

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), "utf8")
}

describe("parseProcBusInputDevices", () => {
  it("identifies the AYN InputPlumber virtual controller as a gamepad", async () => {
    const content = await loadFixture("bus-input-devices-device.txt")

    const devices = parseProcBusInputDevices(content)
    const gamepad = devices.find(device => device.eventNode === "event9")

    expect(gamepad).toEqual({
      deviceId: "inputplumber-virtual-xbox360",
      class: "gamepad",
      name: "InputPlumber Virtual Xbox 360 Controller",
      eventNode: "event9",
      capabilities: ["EV_KEY", "EV_ABS", "BTN_GAMEPAD"],
    })
  })

  it("classifies common laptop keyboard, mouse, and touch devices", async () => {
    const content = await loadFixture("bus-input-devices-laptop.txt")

    const devices = parseProcBusInputDevices(content)

    expect(devices.map(device => [device.name, device.class])).toEqual([
      ["USB Keyboard", "keyboard"],
      ["USB Optical Mouse", "mouse"],
      ["Touchscreen", "touch"],
    ])
  })

  it("falls back from empty uniq to phys for deviceId", async () => {
    const content = await loadFixture("bus-input-devices-device.txt")

    const devices = parseProcBusInputDevices(content)
    const gamepad = devices.find(
      device => device.name === "Controller With Keyboard Range",
    )

    expect(gamepad?.deviceId).toBe("usb-gamepad-with-keyboard-range")
  })

  it("falls back to event node when uniq and phys are empty", async () => {
    const content = await loadFixture("bus-input-devices-device.txt")

    const devices = parseProcBusInputDevices(content)
    const unknown = devices.find(device => device.name === "Mystery Device")

    expect(unknown?.deviceId).toBe("event0")
  })

  it("prefers gamepad classification over keyboard range markers", async () => {
    const content = await loadFixture("bus-input-devices-device.txt")

    const devices = parseProcBusInputDevices(content)
    const gamepad = devices.find(
      device => device.name === "Controller With Keyboard Range",
    )

    expect(gamepad?.class).toBe("gamepad")
    expect(gamepad?.capabilities).toContain("BTN_GAMEPAD")
  })

  it("classifies devices with no recognized marker bits as unknown", async () => {
    const content = await loadFixture("bus-input-devices-device.txt")

    const devices = parseProcBusInputDevices(content)
    const unknown = devices.find(device => device.name === "Mystery Device")

    expect(unknown?.class).toBe("unknown")
  })

  it("returns an empty list for empty input", () => {
    expect(parseProcBusInputDevices("")).toEqual([])
  })

  it("skips malformed B lines without throwing", () => {
    const content = `
I: Bus=0019 Vendor=0000 Product=0000 Version=0000
N: Name="Keyboard With Malformed Capability"
P: Phys=keyboard/phys
S: Sysfs=/devices/virtual/input/input11
U: Uniq=
H: Handlers=event11
B: KEY=nothex
B: KEY=40000000
`

    expect(() => parseProcBusInputDevices(content)).not.toThrow()
    expect(parseProcBusInputDevices(content)).toEqual([
      {
        deviceId: "keyboard/phys",
        class: "keyboard",
        name: "Keyboard With Malformed Capability",
        eventNode: "event11",
        capabilities: ["EV_KEY", "KEY_A"],
      },
    ])
  })
})
