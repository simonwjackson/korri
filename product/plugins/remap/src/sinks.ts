import type {
  RemapControlRef,
  RemapControllerControl,
  RemapControllerRef,
  RemapKeyboardRef,
  RemapPlayerSlot,
} from "./control-ref"

export interface RemapSinkCapabilities {
  readonly keyboard?: boolean
  readonly gamepad?: boolean
}

export type RemapSinkEvent =
  | { readonly type: "keyboard"; readonly action: "press" | "release"; readonly key: string }
  | {
      readonly type: "gamepad"
      readonly action: "press" | "release"
      readonly player: RemapPlayerSlot
      readonly control: RemapControllerControl
    }

export interface RemapSink {
  readonly capabilities: RemapSinkCapabilities
  readonly pressKeyboard: (target: RemapKeyboardRef) => void
  readonly releaseKeyboard: (target: RemapKeyboardRef) => void
  readonly pressGamepad: (target: RemapControllerRef) => void
  readonly releaseGamepad: (target: RemapControllerRef) => void
}

export interface MemoryRemapSink extends RemapSink {
  readonly events: RemapSinkEvent[]
}

export function createMemoryRemapSink(
  capabilities: RemapSinkCapabilities,
): MemoryRemapSink {
  const events: RemapSinkEvent[] = []
  return {
    capabilities,
    events,
    pressKeyboard: target => {
      events.push({ type: "keyboard", action: "press", key: target.key })
    },
    releaseKeyboard: target => {
      events.push({ type: "keyboard", action: "release", key: target.key })
    },
    pressGamepad: target => {
      events.push({
        type: "gamepad",
        action: "press",
        player: target.player,
        control: target.control,
      })
    },
    releaseGamepad: target => {
      events.push({
        type: "gamepad",
        action: "release",
        player: target.player,
        control: target.control,
      })
    },
  }
}

export function validateSinkCapabilities(
  sink: RemapSink,
  targets: readonly RemapControlRef[],
): void {
  for (const target of targets) {
    if (target.kind === "keyboard" && sink.capabilities.keyboard !== true) {
      throw new Error(`Remap keyboard target ${target.ref} is not supported by sink`)
    }
    if (target.kind === "controller" && sink.capabilities.gamepad !== true) {
      throw new Error(`Remap gamepad target ${target.ref} is not supported by sink`)
    }
  }
}

export function pressTarget(sink: RemapSink, target: RemapControlRef): void {
  if (target.kind === "keyboard") sink.pressKeyboard(target)
  else sink.pressGamepad(target)
}

export function releaseTarget(sink: RemapSink, target: RemapControlRef): void {
  if (target.kind === "keyboard") sink.releaseKeyboard(target)
  else sink.releaseGamepad(target)
}
