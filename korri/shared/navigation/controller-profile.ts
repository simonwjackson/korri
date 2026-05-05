import type { GamepadAdapterOptions } from "@shared/input/gamepad-adapter"
import type { NativeInputAdapterOptions } from "@shared/input/native-adapter"

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
    }

export interface ResolvedControllerInput {
  readonly gamepad: false | GamepadAdapterOptions | undefined
  readonly native: false | NativeInputAdapterOptions
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

  switch (normalized.profile) {
    case "auto":
      return native ? { gamepad: false, native } : { gamepad, native: false }
    case "web":
      return { gamepad, native: false }
    case "native":
      return native
        ? { gamepad: false, native }
        : {
            ...disabledControllerInput(),
            warning: "controller profile 'native' requires native options",
          }
    case "debug-both":
      return native
        ? { gamepad, native }
        : {
            gamepad,
            native: false,
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
} {
  if (typeof options === "string") {
    return { profile: options }
  }

  return {
    profile: options.profile ?? "auto",
    gamepad: options.gamepad,
    native: options.native,
  }
}

function disabledControllerInput(): ResolvedControllerInput {
  return { gamepad: false, native: false }
}
