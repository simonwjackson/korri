export type NativeInputDeviceClass =
  | "gamepad"
  | "keyboard"
  | "mouse"
  | "touch"
  | "system"
  | "unknown"

export interface NativeInputAxisInfo {
  readonly code: number
  readonly minimum: number
  readonly maximum: number
  readonly flat?: number
}

export interface DiscoveredDevice {
  readonly deviceId: string
  readonly class: NativeInputDeviceClass
  readonly name: string
  readonly eventNode: string
  readonly capabilities: readonly string[]
  readonly axes?: readonly NativeInputAxisInfo[]
}

type DeviceBlock = {
  readonly name?: string
  readonly phys?: string
  readonly uniq?: string
  readonly eventNode?: string
  readonly capabilities: ReadonlyMap<string, readonly string[]>
}

const BITS_PER_PROC_WORD = 64

const BTN_JOYSTICK = 0x120
const BTN_GAMEPAD = 0x130
const KEY_A = 0x1e
const KEY_SYSTEM = 0xc2
const KEY_VOLUMEUP = 0x73
const KEY_VOLUMEDOWN = 0x72
const KEY_BRIGHTNESSUP = 0xe1
const KEY_BRIGHTNESSDOWN = 0xe0
const KEY_POWER = 0x74
const REL_X = 0x00
const REL_Y = 0x01
const BTN_TOUCH = 0x14a
const ABS_MT_SLOT = 0x2f
const ABS_MT_TOOL_Y = 0x3f

export function parseProcBusInputDevices(
  content: string,
): readonly DiscoveredDevice[] {
  if (!content || typeof content !== "string") return []

  return content
    .split(/\n\s*\n/)
    .map(parseDeviceBlock)
    .filter((device): device is DiscoveredDevice => device !== undefined)
}

function parseDeviceBlock(block: string): DiscoveredDevice | undefined {
  const lines = block
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) return undefined

  const parsed: DeviceBlock = {
    name: parseNamedValue(lines, "N"),
    phys: parseNamedValue(lines, "P"),
    uniq: parseNamedValue(lines, "U"),
    eventNode: parseEventNode(lines),
    capabilities: parseCapabilities(lines),
  }

  if (!parsed.name || !parsed.eventNode) return undefined

  const deviceClass = classifyDevice(parsed.capabilities)

  return {
    deviceId: stableDeviceId(parsed),
    class: deviceClass,
    name: parsed.name,
    eventNode: parsed.eventNode,
    capabilities: summarizeCapabilities(parsed.capabilities),
  }
}

function parseNamedValue(
  lines: readonly string[],
  prefix: string,
): string | undefined {
  const line = lines.find(line => line.startsWith(`${prefix}:`))
  if (!line) return undefined

  const value = line.slice(2).trim()
  const equalIndex = value.indexOf("=")
  const raw = equalIndex === -1 ? value : value.slice(equalIndex + 1)
  const normalized = raw.trim().replace(/^"|"$/g, "")

  return normalized.length > 0 ? normalized : undefined
}

function parseEventNode(lines: readonly string[]): string | undefined {
  const handlers = parseNamedValue(lines, "H")
  return handlers?.match(/\bevent\d+\b/)?.[0]
}

function parseCapabilities(
  lines: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const capabilities = new Map<string, string[]>()

  for (const line of lines) {
    const match = line.match(/^B:\s+([A-Z0-9_]+)=([0-9a-fA-F\s]+)$/)
    if (!match) continue

    const [, key, bitmap] = match
    if (!key || !bitmap) continue

    const words = bitmap
      .trim()
      .split(/\s+/)
      .filter(word => /^[0-9a-fA-F]+$/.test(word))

    if (words.length === 0) continue

    capabilities.set(key, [...(capabilities.get(key) ?? []), ...words])
  }

  return capabilities
}

function stableDeviceId(device: DeviceBlock): string {
  return device.uniq ?? device.phys ?? device.eventNode ?? "unknown"
}

function classifyDevice(
  capabilities: ReadonlyMap<string, readonly string[]>,
): NativeInputDeviceClass {
  if (
    hasKeyBit(capabilities, BTN_GAMEPAD) ||
    hasKeyBit(capabilities, BTN_JOYSTICK)
  ) {
    return "gamepad"
  }

  if (hasKeyBit(capabilities, BTN_TOUCH) || hasAbsMultiTouchBit(capabilities)) {
    return "touch"
  }

  if (hasSystemKeyBit(capabilities)) {
    return "system"
  }

  if (hasRelBit(capabilities, REL_X) && hasRelBit(capabilities, REL_Y)) {
    return "mouse"
  }

  if (hasKeyBit(capabilities, KEY_A)) {
    return "keyboard"
  }

  return "unknown"
}

function summarizeCapabilities(
  capabilities: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const out: string[] = []

  if (capabilities.has("KEY")) out.push("EV_KEY")
  if (capabilities.has("ABS")) out.push("EV_ABS")
  if (capabilities.has("REL")) out.push("EV_REL")
  if (hasKeyBit(capabilities, BTN_GAMEPAD)) out.push("BTN_GAMEPAD")
  if (hasKeyBit(capabilities, BTN_JOYSTICK)) out.push("BTN_JOYSTICK")
  if (hasKeyBit(capabilities, KEY_A)) out.push("KEY_A")
  if (hasSystemKeyBit(capabilities)) out.push("SYSTEM_KEYS")
  if (hasKeyBit(capabilities, BTN_TOUCH)) out.push("BTN_TOUCH")
  if (hasAbsMultiTouchBit(capabilities)) out.push("ABS_MT")
  if (hasRelBit(capabilities, REL_X)) out.push("REL_X")
  if (hasRelBit(capabilities, REL_Y)) out.push("REL_Y")

  return out
}

function hasSystemKeyBit(
  capabilities: ReadonlyMap<string, readonly string[]>,
): boolean {
  return [
    KEY_SYSTEM,
    KEY_VOLUMEUP,
    KEY_VOLUMEDOWN,
    KEY_BRIGHTNESSUP,
    KEY_BRIGHTNESSDOWN,
    KEY_POWER,
  ].some(bit => hasKeyBit(capabilities, bit))
}

function hasKeyBit(
  capabilities: ReadonlyMap<string, readonly string[]>,
  bit: number,
): boolean {
  return hasBitmapBit(capabilities.get("KEY") ?? [], bit)
}

function hasRelBit(
  capabilities: ReadonlyMap<string, readonly string[]>,
  bit: number,
): boolean {
  return hasBitmapBit(capabilities.get("REL") ?? [], bit)
}

function hasAbsMultiTouchBit(
  capabilities: ReadonlyMap<string, readonly string[]>,
): boolean {
  for (let bit = ABS_MT_SLOT; bit <= ABS_MT_TOOL_Y; bit++) {
    if (hasBitmapBit(capabilities.get("ABS") ?? [], bit)) return true
  }
  return false
}

function hasBitmapBit(words: readonly string[], bit: number): boolean {
  if (words.length === 0) return false

  const wordIndexFromRight = Math.floor(bit / BITS_PER_PROC_WORD)
  const index = words.length - 1 - wordIndexFromRight
  if (index < 0 || index >= words.length) return false

  const word = BigInt(`0x${words[index]}`)
  const mask = 1n << BigInt(bit % BITS_PER_PROC_WORD)
  return (word & mask) !== 0n
}
