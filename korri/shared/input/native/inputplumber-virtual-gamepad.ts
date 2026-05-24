import type { DiscoveredDevice } from "./discover-devices"

export type InputPlumberVirtualGamepadResolution =
  | {
      readonly status: "found"
      readonly device: DiscoveredDevice
      readonly path: string
    }
  | {
      readonly status: "missing"
      readonly rawGamepads: number
    }
  | {
      readonly status: "ambiguous"
      readonly devices: readonly DiscoveredDevice[]
    }

export function resolveInputPlumberVirtualGamepad(
  devices: readonly DiscoveredDevice[],
  options: { readonly inputRoot?: string } = {},
): InputPlumberVirtualGamepadResolution {
  const candidates = devices.filter(isInputPlumberVirtualGamepad)

  if (candidates.length === 1) {
    const [device] = candidates
    return {
      status: "found",
      device,
      path: `${options.inputRoot ?? "/dev/input"}/${device.eventNode}`,
    }
  }

  if (candidates.length > 1) {
    return { status: "ambiguous", devices: candidates }
  }

  return {
    status: "missing",
    rawGamepads: devices.filter(device => device.class === "gamepad").length,
  }
}

export function isInputPlumberVirtualGamepad(
  device: DiscoveredDevice,
): boolean {
  if (device.class !== "gamepad") return false

  const evidence = [
    device.deviceId,
    device.physicalPath,
    device.uniqueId,
    device.sysfsPath,
    device.name,
  ]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.toLowerCase())

  return evidence.some(value => value.includes("inputplumber"))
}
