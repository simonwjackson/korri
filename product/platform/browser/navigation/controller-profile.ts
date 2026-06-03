import type { DesktopBridgeAdapterOptions } from "@platform/input/desktop-bridge-adapter"
import type { GamepadAdapterOptions } from "@platform/input/gamepad-adapter"
import type { NativeInputAdapterOptions } from "@platform/input/native-adapter"

export const CONTROLLER_INPUT_PROFILES = [
  "auto",
  "web",
  "native",
  "debug-both",
] as const

export type ControllerInputProfile = (typeof CONTROLLER_INPUT_PROFILES)[number]

export type ControllerInputOptions =
  | false
  | ControllerInputProfile
  | {
      readonly profile?: ControllerInputProfile
      readonly gamepad?: false | GamepadAdapterOptions
      readonly native?: NativeInputAdapterOptions
      readonly desktop?: DesktopBridgeAdapterOptions
    }

export interface ResolvedControllerInput {
  readonly gamepad: false | GamepadAdapterOptions | undefined
  readonly native: false | NativeInputAdapterOptions
  readonly desktop: false | DesktopBridgeAdapterOptions
  readonly warning?: string
}

export function isControllerInputProfile(
  value: unknown,
): value is ControllerInputProfile {
  return (
    typeof value === "string" &&
    CONTROLLER_INPUT_PROFILES.includes(value as ControllerInputProfile)
  )
}

export function resolveControllerInput(
  options: ControllerInputOptions | undefined = "auto",
): ResolvedControllerInput {
  if (options === false) return disabledControllerInput()

  const normalized = normalizeControllerInputOptions(options)
  const gamepad = normalized.gamepad === false ? false : normalized.gamepad
  const native = normalized.native
  const desktop = normalized.desktop

  switch (normalized.profile) {
    case "auto":
      if (desktop) return { gamepad: false, native: false, desktop }
      return native
        ? { gamepad: false, native, desktop: false }
        : { gamepad, native: false, desktop: false }
    case "web":
      return { gamepad, native: false, desktop: false }
    case "native":
      return native
        ? { gamepad: false, native, desktop: false }
        : {
            ...disabledControllerInput(),
            warning: "controller profile 'native' requires native options",
          }
    case "debug-both":
      return native
        ? { gamepad, native, desktop: false }
        : {
            gamepad,
            native: false,
            desktop: false,
            warning:
              "controller profile 'debug-both' requires native options for native input",
          }
  }
}

function normalizeControllerInputOptions(
  options: Exclude<ControllerInputOptions, false>,
): {
  readonly profile: ControllerInputProfile
  readonly gamepad?: false | GamepadAdapterOptions
  readonly native?: NativeInputAdapterOptions
  readonly desktop?: DesktopBridgeAdapterOptions
} {
  if (typeof options === "string") {
    return { profile: options }
  }

  return {
    profile: options.profile ?? "auto",
    gamepad: options.gamepad,
    native: options.native,
    desktop: options.desktop,
  }
}

function disabledControllerInput(): ResolvedControllerInput {
  return { gamepad: false, native: false, desktop: false }
}
