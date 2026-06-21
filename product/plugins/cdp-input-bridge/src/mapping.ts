export type BridgeMappingName = "yfs-default" | "none"

export type BridgeActionId =
  | "arrow-up"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "key-z"
  | "key-a"
  | "key-x"
  | "key-s"
  | "key-p"

export interface CdpKeyBinding {
  readonly key: string
  readonly code: string
  readonly windowsVirtualKeyCode: number
}

export interface AxisMapping {
  readonly code: string
  readonly negative?: BridgeActionId
  readonly positive?: BridgeActionId
  readonly pressThreshold: number
  readonly releaseThreshold: number
}

export interface BridgeMapping {
  readonly name: BridgeMappingName
  readonly buttons: Readonly<Record<string, BridgeActionId>>
  readonly axes: readonly AxisMapping[]
  readonly keys: Readonly<Record<BridgeActionId, CdpKeyBinding>>
}

export const DEFAULT_AXIS_PRESS_THRESHOLD = 12000
export const DEFAULT_AXIS_RELEASE_THRESHOLD = 8000

export const YFS_DEFAULT_MAPPING: BridgeMapping = {
  name: "yfs-default",
  buttons: {
    BTN_DPAD_UP: "arrow-up",
    BTN_DPAD_DOWN: "arrow-down",
    BTN_DPAD_LEFT: "arrow-left",
    BTN_DPAD_RIGHT: "arrow-right",
    BTN_WEST: "key-z",
    BTN_SOUTH: "key-a",
    BTN_EAST: "key-x",
    BTN_NORTH: "key-s",
    BTN_START: "key-p",
  },
  axes: [
    axis("ABS_X", "arrow-left", "arrow-right"),
    axis("ABS_Y", "arrow-up", "arrow-down"),
    axis("ABS_RX", "arrow-left", "arrow-right"),
    axis("ABS_RY", "arrow-up", "arrow-down"),
  ],
  keys: {
    "arrow-up": { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
    "arrow-down": {
      key: "ArrowDown",
      code: "ArrowDown",
      windowsVirtualKeyCode: 40,
    },
    "arrow-left": {
      key: "ArrowLeft",
      code: "ArrowLeft",
      windowsVirtualKeyCode: 37,
    },
    "arrow-right": {
      key: "ArrowRight",
      code: "ArrowRight",
      windowsVirtualKeyCode: 39,
    },
    "key-z": { key: "z", code: "KeyZ", windowsVirtualKeyCode: 90 },
    "key-a": { key: "a", code: "KeyA", windowsVirtualKeyCode: 65 },
    "key-x": { key: "x", code: "KeyX", windowsVirtualKeyCode: 88 },
    "key-s": { key: "s", code: "KeyS", windowsVirtualKeyCode: 83 },
    "key-p": { key: "p", code: "KeyP", windowsVirtualKeyCode: 80 },
  },
}

const NONE_MAPPING: BridgeMapping = {
  name: "none",
  buttons: {},
  axes: [],
  keys: YFS_DEFAULT_MAPPING.keys,
}

export function resolveBridgeMapping(name: string): BridgeMapping {
  switch (name) {
    case "yfs-default":
      return YFS_DEFAULT_MAPPING
    case "none":
      return NONE_MAPPING
    default:
      throw new Error(`Unknown CDP input bridge mapping: ${name}`)
  }
}

export function cdpKeyboardEventForBinding(
  mapping: BridgeMapping,
  action: BridgeActionId,
): CdpKeyBinding {
  const binding = mapping.keys[action]
  if (!binding) throw new Error(`No CDP key binding for action: ${action}`)
  return binding
}

export function withAxisThresholds(
  mapping: BridgeMapping,
  thresholds: {
    readonly pressThreshold: number
    readonly releaseThreshold: number
  },
): BridgeMapping {
  return {
    ...mapping,
    axes: mapping.axes.map(axis => ({ ...axis, ...thresholds })),
  }
}

function axis(
  code: string,
  negative: BridgeActionId,
  positive: BridgeActionId,
): AxisMapping {
  return {
    code,
    negative,
    positive,
    pressThreshold: DEFAULT_AXIS_PRESS_THRESHOLD,
    releaseThreshold: DEFAULT_AXIS_RELEASE_THRESHOLD,
  }
}
