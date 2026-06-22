export type RemapPlayerSlot = "p1" | "p2" | "p3" | "p4"
export type RemapDirection = "up" | "down" | "left" | "right"
export type RemapButton = "north" | "south" | "east" | "west" | "start" | "select"
export type RemapStick = "left" | "right"

export type RemapControllerControl =
  | { readonly kind: "dpad"; readonly direction: RemapDirection }
  | { readonly kind: "button"; readonly button: RemapButton }
  | {
      readonly kind: "stick"
      readonly stick: RemapStick
      readonly direction: RemapDirection
    }

export interface RemapControllerRef {
  readonly kind: "controller"
  readonly player: RemapPlayerSlot
  readonly control: RemapControllerControl
  readonly ref: string
}

export interface RemapKeyboardRef {
  readonly kind: "keyboard"
  readonly key: string
  readonly ref: string
}

export type RemapControlRef = RemapControllerRef | RemapKeyboardRef

const PLAYER_SLOTS = new Set(["p1", "p2", "p3", "p4"])
const DIRECTIONS = new Set(["up", "down", "left", "right"])
const BUTTONS = new Set(["north", "south", "east", "west", "start", "select"])
const STICKS = new Set(["left", "right"])
const KEBAB_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const ARROW_KEY_ALIASES: Readonly<Record<string, string>> = {
  up: "arrow-up",
  down: "arrow-down",
  left: "arrow-left",
  right: "arrow-right",
}

export function parseControlRef(ref: string): RemapControlRef {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new Error("Remap control ref must be a non-empty string")
  }
  const parts = ref.split(".")
  const namespace = parts[0]
  if (namespace === "key") return parseKeyboardRef(ref, parts)
  if (namespace?.startsWith("p")) return parseControllerRef(ref, parts)
  throw new Error(`Unknown Remap control ref namespace: ${namespace ?? ""}`)
}

function parseKeyboardRef(ref: string, parts: readonly string[]): RemapKeyboardRef {
  if (parts.length !== 2 || !parts[1]) {
    throw new Error(`Malformed Remap keyboard ref: ${ref}`)
  }
  const key = parts[1]
  if (!KEBAB_KEY.test(key)) {
    throw new Error(`Remap keyboard key must be kebab-case: ${ref}`)
  }
  return { kind: "keyboard", key: ARROW_KEY_ALIASES[key] ?? key, ref }
}

function parseControllerRef(
  ref: string,
  parts: readonly string[],
): RemapControllerRef {
  const player = parts[0]
  if (!PLAYER_SLOTS.has(player ?? "")) {
    throw new Error(`Remap controller player slot must be p1, p2, p3, or p4: ${ref}`)
  }
  if (parts[1] === "dpad") {
    if (parts.length !== 3 || !DIRECTIONS.has(parts[2] ?? "")) {
      throw new Error(`Malformed Remap dpad ref: ${ref}`)
    }
    return {
      kind: "controller",
      player: player as RemapPlayerSlot,
      control: { kind: "dpad", direction: parts[2] as RemapDirection },
      ref,
    }
  }
  if (parts[1] === "button") {
    if (parts.length !== 3 || !BUTTONS.has(parts[2] ?? "")) {
      throw new Error(`Malformed Remap button ref: ${ref}`)
    }
    return {
      kind: "controller",
      player: player as RemapPlayerSlot,
      control: { kind: "button", button: parts[2] as RemapButton },
      ref,
    }
  }
  if (parts[1] === "stick") {
    if (
      parts.length !== 4 ||
      !STICKS.has(parts[2] ?? "") ||
      !DIRECTIONS.has(parts[3] ?? "")
    ) {
      throw new Error(`Malformed Remap stick ref: ${ref}`)
    }
    return {
      kind: "controller",
      player: player as RemapPlayerSlot,
      control: {
        kind: "stick",
        stick: parts[2] as RemapStick,
        direction: parts[3] as RemapDirection,
      },
      ref,
    }
  }
  throw new Error(`Malformed Remap controller ref: ${ref}`)
}

export function isControllerRef(ref: RemapControlRef): ref is RemapControllerRef {
  return ref.kind === "controller"
}
