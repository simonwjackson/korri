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

export interface InputPlumberVirtualGamepadResolutionOptions {
  readonly inputRoot?: string
  readonly preferredNames?: readonly string[]
  readonly preferredEventNodes?: readonly string[]
}

export function resolveInputPlumberVirtualGamepad(
  devices: readonly DiscoveredDevice[],
  options: InputPlumberVirtualGamepadResolutionOptions = {},
): InputPlumberVirtualGamepadResolution {
  const candidates = devices.filter(isInputPlumberVirtualGamepad)
  const preferredCandidates = filterPreferredCandidates(candidates, options)
  const selection = preferredCandidates ?? candidates

  if (selection.length === 1) {
    const [device] = selection
    return foundDevice(device, options.inputRoot)
  }

  if (selection.length > 1) {
    return { status: "ambiguous", devices: selection }
  }

  return {
    status: "missing",
    rawGamepads: devices.filter(device => device.class === "gamepad").length,
  }
}

function foundDevice(
  device: DiscoveredDevice,
  inputRoot: string | undefined,
): InputPlumberVirtualGamepadResolution {
  return {
    status: "found",
    device,
    path: `${inputRoot ?? "/dev/input"}/${device.eventNode}`,
  }
}

function filterPreferredCandidates(
  candidates: readonly DiscoveredDevice[],
  options: InputPlumberVirtualGamepadResolutionOptions,
): readonly DiscoveredDevice[] | undefined {
  const names = options.preferredNames ?? []
  const eventNodes = options.preferredEventNodes ?? []
  if (names.length === 0 && eventNodes.length === 0) return undefined

  const normalizedNames = new Set(names.map(normalizePreference))
  const normalizedEventNodes = new Set(eventNodes.map(normalizePreference))
  return candidates.filter(
    device =>
      normalizedNames.has(normalizePreference(device.name)) ||
      normalizedEventNodes.has(normalizePreference(device.eventNode)),
  )
}

function normalizePreference(value: string): string {
  return value.trim().toLowerCase()
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

  if (evidence.some(value => value.includes("inputplumber"))) return true

  return Boolean(
    device.sysfsPath?.startsWith("/devices/virtual/input/") &&
      isKnownInputPlumberVirtualTargetName(device.name),
  )
}

function isKnownInputPlumberVirtualTargetName(name: string): boolean {
  return [
    "Microsoft X-Box 360 pad",
    "Microsoft Xbox Series S|X Controller",
  ].includes(name)
}
